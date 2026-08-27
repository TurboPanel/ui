#!/usr/bin/env node
/**
 * Generate or check THIRD_PARTY_NOTICES.md from the resolved dependency graph.
 *
 * Usage:
 *   node scripts/generate-notices.mjs
 *   node scripts/generate-notices.mjs --check
 *   node scripts/generate-notices.mjs --check --js-only
 *   node scripts/generate-notices.mjs --check --native
 *   pnpm notices:generate
 *   pnpm notices:check
 *
 * After Expo prebuild, generated `ios/` / `android/` trees are scanned so the
 * CocoaPods / Gradle / AAR / bundled-resource graph is included — not just JS.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  attachLicensesFromMap,
  enrichMissingPackageLicenses,
  evaluateLicensePolicy,
  NOTICE_POLICY_REPO_LICENSE,
  fingerprintCommentValue,
  formatPolicyFailures,
  mergeNoticePackages,
  NOTICES_FILE_NAME,
  noticePackageKey,
  noticesAreCurrent,
  licenseFromPomXml,
  packagesFromGradleDependencyReport,
  packagesFromMavenPom,
  packagesFromPnpmLicenses,
  packagesFromPodfileLock,
  packagesFromPodspecJson,
  pnpmLicenseKeys,
  pnpmPackagePaths,
  renderThirdPartyNotices,
  spdxFromLicenseName,
} from '../src/lib/notices.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLED_RESOURCE_DIRS = ['assets/fonts']

/**
 * @typedef {import('../src/lib/notices.ts').NoticePackage} NoticePackage
 * @typedef {import('../src/lib/notices.ts').PnpmLicenseEntry} PnpmLicenseEntry
 * @typedef {{ name: string, isDirectory?: () => boolean }} NoticeDirent
 * @typedef {{
 *   exists: (target: string) => boolean
 *   readFile: (target: string, encoding?: BufferEncoding) => string | Buffer
 *   readdir?: (target: string) => NoticeDirent[]
 *   readGradleReport?: () => string
 *   gradleHome?: string
 * }} NativeFsApi
 */

/**
 * @param {{
 *   root?: string
 *   argv?: string[]
 *   io?: { log: (...args: unknown[]) => void, error: (...args: unknown[]) => void }
 *   exit?: (code: number) => void
 *   spawnPnpmLicenses?: (prodOnly: boolean) => Record<string, PnpmLicenseEntry[]>
 *   readFile?: (target: string, encoding?: BufferEncoding) => string | Buffer
 *   writeFile?: (target: string, contents: string) => void
 *   exists?: (target: string) => boolean
 *   readdir?: (target: string) => NoticeDirent[]
 *   readGradleReport?: () => string
 *   gradleHome?: string
 * }} [options]
 * @returns {0 | 1}
 */
export function runGenerateNotices({
  root = ROOT,
  argv = process.argv.slice(2),
  io = console,
  exit,
  spawnPnpmLicenses = (prodOnly) => loadPnpmLicenses(root, prodOnly),
  readFile = (target, encoding) => fs.readFileSync(target, encoding),
  writeFile = (target, contents) => fs.writeFileSync(target, contents),
  exists = (target) => fs.existsSync(target),
  readdir = (target) => fs.readdirSync(target, { withFileTypes: true }),
  readGradleReport,
} = {}) {
  const check = argv.includes('--check')
  const jsOnly = argv.includes('--js-only')
  const leave = exit ?? ((code) => process.exit(code))

  let allGrouped
  let prodGrouped
  try {
    allGrouped = spawnPnpmLicenses(false)
    prodGrouped = spawnPnpmLicenses(true)
  } catch (error) {
    io.error(
      error instanceof Error
        ? error.message
        : 'generate-notices: failed to read pnpm licenses',
    )
    leave(1)
    return 1
  }

  const prodKeys = pnpmLicenseKeys(prodGrouped)
  const jsPackages = enrichMissingPackageLicenses(
    packagesFromPnpmLicenses(allGrouped, prodKeys),
    (pkg) => readPnpmInstallLicense(root, allGrouped, pkg, exists, readFile),
  )
  const nativeFs = { exists, readFile, readdir, readGradleReport }
  const nativePackages = collectNativePackages(root, nativeFs)
  if (!jsOnly && nativeBuildExpected(root, argv, exists) && !hasResolvedNativeGraph(nativePackages)) {
    io.error(
      'generate-notices: native build expected but the generated native graph is absent (CocoaPods / Gradle / AAR).',
    )
    leave(1)
    return 1
  }
  const packages = mergeNoticePackages([jsPackages, nativePackages])
  const policy = evaluateLicensePolicy(packages, {
    repoLicense: NOTICE_POLICY_REPO_LICENSE,
  })
  if (policy.length > 0) {
    io.error('generate-notices: unreviewed license class:\n')
    io.error(formatPolicyFailures(policy))
    leave(1)
    return 1
  }

  const lockfileFingerprints = collectLockfileFingerprints(root, exists, readFile)

  const markdown = renderThirdPartyNotices(packages, {
    repoLicense: 'AGPL-3.0-only',
    productName: 'TurboPanel UI',
    regenerateCommand: 'pnpm notices:generate',
    lockfileFingerprints,
    extraPreamble:
      'Third-party OS artwork under `assets/os/` is recorded separately in `assets/os/NOTICE.md` and is not licensed under this repository’s AGPL or the Apple App Store additional permission.',
  })

  const noticesPath = path.join(root, NOTICES_FILE_NAME)
  if (check) {
    if (!exists(noticesPath)) {
      io.error(`generate-notices: missing ${NOTICES_FILE_NAME} — run pnpm notices:generate`)
      leave(1)
      return 1
    }
    const existing = readFile(noticesPath, 'utf8')
    if (!noticesAreCurrent(existing, markdown)) {
      io.error(
        `generate-notices: ${NOTICES_FILE_NAME} is stale relative to the lockfile. Run pnpm notices:generate and commit the result.`,
      )
      leave(1)
      return 1
    }
    io.log(`generate-notices: ${NOTICES_FILE_NAME} is current.`)
    return 0
  }

  writeFile(noticesPath, markdown)
  io.log(`generate-notices: wrote ${NOTICES_FILE_NAME} (${packages.length} packages).`)
  return 0
}

const PNPM_BIN_NAME = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

/**
 * Resolve an absolute pnpm invocation. Spawning a bare `pnpm` would resolve
 * through `PATH`, so any writable entry there could hijack the child process;
 * only absolute, install-managed locations are accepted.
 * @param {string} root
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(target: string) => boolean} [exists]
 * @returns {{ command: string, prefix: string[] }}
 */
export function resolvePnpmCommand(root, env = process.env, exists = fs.existsSync) {
  const execpath = env.npm_execpath
  if (execpath && path.isAbsolute(execpath) && exists(execpath)) {
    return /\.[cm]?js$/.test(execpath)
      ? { command: process.execPath, prefix: [execpath] }
      : { command: execpath, prefix: [] }
  }
  const candidate = [
    path.join(root, 'node_modules', '.bin', PNPM_BIN_NAME),
    path.join(path.dirname(process.execPath), PNPM_BIN_NAME),
  ].find((target) => exists(target))
  if (!candidate) {
    throw new Error(
      'generate-notices: no pnpm executable found at an absolute path — run via `pnpm notices:generate`.',
    )
  }
  return { command: candidate, prefix: [] }
}

/**
 * @param {string} root
 * @param {boolean} prodOnly
 * @returns {Record<string, PnpmLicenseEntry[]>}
 */
export function loadPnpmLicenses(root, prodOnly) {
  const { command, prefix } = resolvePnpmCommand(root)
  const args = [...prefix, 'licenses', 'list', '--json', '--long']
  if (prodOnly) args.push('--prod')
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  })
  if (result.status !== 0) {
    throw new Error(
      `generate-notices: pnpm licenses list failed (${result.status}): ${result.stderr || result.stdout || 'no output'}`,
    )
  }
  return parsePnpmLicensesJson(result.stdout)
}

export function parsePnpmLicensesJson(stdout) {
  const start = stdout.indexOf('{')
  if (start === -1) {
    throw new TypeError('generate-notices: no JSON in pnpm licenses output')
  }
  const parsed = JSON.parse(stdout.slice(start))
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('generate-notices: unexpected pnpm licenses JSON')
  }
  return parsed
}

/**
 * @param {string} root
 * @param {Record<string, import('../src/lib/notices.ts').PnpmLicenseEntry[]>} grouped
 * @param {import('../src/lib/notices.ts').NoticePackage} pkg
 * @param {(target: string) => boolean} exists
 * @param {(target: string, encoding: BufferEncoding) => string} readFile
 * @returns {string | undefined}
 */
export function readPnpmInstallLicense(root, grouped, pkg, exists, readFile) {
  const rel = pnpmPackagePaths(grouped).get(noticePackageKey(pkg))
  if (!rel) return undefined
  const dir = path.isAbsolute(rel) ? rel : path.join(root, rel)
  const pkgJsonPath = path.join(dir, 'package.json')
  if (exists(pkgJsonPath)) {
    try {
      const parsed = JSON.parse(readFile(pkgJsonPath, 'utf8'))
      const field = parsed.license ?? parsed.licenses?.[0]?.type
      if (typeof field === 'string' && field.trim()) return field.trim()
    } catch {
      // fall through to LICENSE scan
    }
  }
  for (const name of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    const candidate = path.join(dir, name)
    if (!exists(candidate)) continue
    const spdx = inferSpdxFromLicenseText(readFile(candidate, 'utf8'))
    if (spdx) return spdx
  }
  return undefined
}

/**
 * @param {string} root
 * @param {string[]} argv
 * @param {(target: string) => boolean} exists
 * @returns {boolean}
 */
export function nativeBuildExpected(root, argv, exists) {
  if (argv.includes('--js-only')) return false
  if (argv.includes('--native') || argv.includes('--release')) return true
  return exists(path.join(root, 'ios')) || exists(path.join(root, 'android'))
}

/**
 * @param {NoticePackage[]} packages
 * @returns {boolean}
 */
export function hasResolvedNativeGraph(packages) {
  return packages.some((pkg) => {
    const source = pkg.source ?? ''
    return (
      source === 'Podfile.lock' ||
      source === 'podspec' ||
      source === 'gradle' ||
      source === 'pom' ||
      source === 'aar'
    )
  })
}

/**
 * @param {string} root
 * @param {NativeFsApi | ((target: string) => boolean)} existsOrFs
 * @param {(target: string, encoding?: BufferEncoding) => string | Buffer} [readFile]
 * @returns {NoticePackage[]}
 */
export function collectNativePackages(root, existsOrFs, readFile) {
  const fsApi = typeof existsOrFs === 'function'
    ? { exists: existsOrFs, readFile, readdir: (dir) => fs.readdirSync(dir, { withFileTypes: true }) }
    : existsOrFs
  const licenses = readNativeLicenseMap(root, fsApi)
  const pods = collectCocoaPodsPackages(root, fsApi, licenses)
  const gradle = collectGradlePackages(root, fsApi)
  const aars = collectAarPomPackages(root, fsApi)
  const bundled = collectBundledResourcePackages(root, fsApi)
  return mergeNoticePackages([pods, gradle, aars, bundled])
}

function collectCocoaPodsPackages(root, fsApi, licenses) {
  const { exists, readFile, readdir } = fsApi
  const podfile = path.join(root, 'ios', 'Podfile.lock')
  const fromLock = exists(podfile)
    ? attachLicensesFromMap(packagesFromPodfileLock(readFile(podfile, 'utf8')), licenses)
    : []
  const specDir = path.join(root, 'ios', 'Pods', 'Local Podspecs')
  const fromSpecs = []
  if (exists(specDir)) {
    for (const dirent of readdir(specDir)) {
      if (!dirent.name.endsWith('.podspec.json')) continue
      const parsed = packagesFromPodspecJson(readFile(path.join(specDir, dirent.name), 'utf8'))
      if (parsed) fromSpecs.push(parsed)
    }
  }
  return mergeNoticePackages([fromLock, fromSpecs])
}

/**
 * @param {string} root
 * @param {NativeFsApi} fsApi
 * @returns {NoticePackage[]}
 */
export function collectGradlePackages(root, fsApi) {
  const report = loadGradleDependencyReport(root, fsApi)
  if (!report.trim()) return []
  return attachAndroidResolvedLicenses(
    packagesFromGradleDependencyReport(report),
    root,
    fsApi,
  )
}

/**
 * Attach SPDX licenses for Gradle coordinates from a resolved source:
 * `android/notice-licenses.json`, POMs in the Android tree, then the Gradle
 * module cache for `releaseRuntimeClasspath` artifacts.
 */
export function attachAndroidResolvedLicenses(packages, root, fsApi) {
  const licenses = {
    ...readNativeLicenseMap(root, fsApi),
    ...readAndroidNoticeLicenseMap(root, fsApi),
    ...collectGradlePomLicenseMap(packages, root, fsApi),
  }
  return packages.map((pkg) => {
    const raw = licenses[noticePackageKey(pkg)] ?? licenses[pkg.name] ?? pkg.license
    if (!raw) return pkg
    const license = spdxFromLicenseName(raw) || raw
    return { ...pkg, license }
  })
}

function readAndroidNoticeLicenseMap(root, fsApi) {
  const out = {}
  for (const rel of [
    path.join('android', 'notice-licenses.json'),
    path.join('android', 'app', 'notice-licenses.json'),
  ]) {
    const candidate = path.join(root, rel)
    if (!fsApi.exists(candidate)) continue
    let parsed
    try {
      parsed = JSON.parse(fsApi.readFile(candidate, 'utf8'))
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string' || !value.trim()) continue
      out[key] = spdxFromLicenseName(value.trim()) || value.trim()
    }
  }
  return out
}

function collectGradlePomLicenseMap(packages, root, fsApi) {
  const map = {}
  indexPomsUnder(map, path.join(root, 'android'), fsApi, new Set(['.gradle', 'build']))
  const cacheRoot = gradleModuleCacheRoot(fsApi)
  for (const pkg of packages) {
    if (map[noticePackageKey(pkg)] || map[pkg.name]) continue
    const coordDir = gradleCacheCoordDir(cacheRoot, pkg)
    if (coordDir) indexPomsUnder(map, coordDir, fsApi)
  }
  return map
}

function indexPomsUnder(map, dir, fsApi, skip) {
  if (!fsApi.exists(dir)) return
  for (const filePath of listFiles(dir, fsApi, skip ? { skip } : {})) {
    if (filePath.endsWith('.pom')) indexPomLicense(map, fsApi.readFile(filePath, 'utf8'))
  }
}

function gradleModuleCacheRoot(fsApi) {
  const gradleHome = fsApi.gradleHome
    ?? process.env.GRADLE_USER_HOME
    ?? path.join(os.homedir(), '.gradle')
  return path.join(gradleHome, 'caches', 'modules-2', 'files-2.1')
}

function gradleCacheCoordDir(cacheRoot, pkg) {
  const [group, artifact] = pkg.name.split(':')
  if (!group || !artifact) return undefined
  return path.join(cacheRoot, group, artifact, pkg.version)
}

function indexPomLicense(map, xml) {
  const parsed = packagesFromMavenPom(xml)
  const license = parsed?.license || licenseFromPomXml(xml)
  if (!parsed || !license) return
  const spdx = spdxFromLicenseName(license) || license
  map[`${parsed.name}@${parsed.version}`] = spdx
  map[parsed.name] = spdx
}

function loadGradleDependencyReport(root, fsApi) {
  const { exists, readFile, readGradleReport } = fsApi
  if (readGradleReport) return readGradleReport()
  const candidates = [
    path.join(root, 'android', 'app', 'build', 'reports', 'dependencies', 'releaseRuntimeClasspath.txt'),
    path.join(root, 'android', 'gradle', 'releaseRuntimeClasspath.txt'),
    path.join(root, 'android', 'app', 'releaseRuntimeClasspath.txt'),
  ]
  for (const candidate of candidates) {
    if (exists(candidate)) return readFile(candidate, 'utf8')
  }
  const androidRoot = path.join(root, 'android')
  const gradlew = path.join(androidRoot, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
  if (!exists(gradlew)) return ''
  const result = spawnSync(gradlew, [
    ':app:dependencies',
    '--configuration',
    'releaseRuntimeClasspath',
    '--console=plain',
  ], {
    cwd: androidRoot,
    encoding: 'utf8',
  })
  return result.status === 0 ? (result.stdout ?? '') : ''
}

/**
 * @param {string} root
 * @param {NativeFsApi} fsApi
 * @returns {NoticePackage[]}
 */
export function collectAarPomPackages(root, fsApi) {
  const androidRoot = path.join(root, 'android')
  if (!fsApi.exists(androidRoot)) return []
  const out = []
  for (const filePath of listFiles(androidRoot, fsApi, { skip: new Set(['.gradle']) })) {
    if (filePath.endsWith('.pom')) {
      const parsed = packagesFromMavenPom(fsApi.readFile(filePath, 'utf8'))
      if (parsed) out.push(parsed)
      continue
    }
    if (!filePath.endsWith('.aar')) continue
    const pomBeside = `${filePath.slice(0, -4)}.pom`
    if (fsApi.exists(pomBeside)) {
      const parsed = packagesFromMavenPom(fsApi.readFile(pomBeside, 'utf8'))
      if (parsed) out.push({ ...parsed, source: 'aar' })
    }
  }
  return out
}

/**
 * @param {string} root
 * @param {NativeFsApi} fsApi
 * @returns {NoticePackage[]}
 */
export function collectBundledResourcePackages(root, fsApi) {
  const out = []
  for (const rel of BUNDLED_RESOURCE_DIRS) {
    const dir = path.join(root, rel)
    if (!fsApi.exists(dir)) continue
    for (const dirent of fsApi.readdir(dir)) {
      if (dirent.isDirectory?.()) continue
      const pkg = bundledResourceFromFile(dirent.name, path.join(dir, dirent.name), fsApi)
      if (pkg) out.push(pkg)
    }
  }
  return out
}

function bundledResourceFromFile(fileName, absPath, fsApi) {
  const ofl = /^OFL-([^.]+)\.txt$/i.exec(fileName)
  if (ofl?.[1]) {
    return {
      name: ofl[1],
      version: '*',
      license: 'OFL-1.1',
      role: 'native',
      source: 'bundled-resource',
      homepage: path.relative(path.dirname(path.dirname(absPath)), absPath),
    }
  }
  if (!/^LICENSE(?:\..+)?$/i.test(fileName) && fileName !== 'NOTICE') return undefined
  const text = fsApi.readFile(absPath, 'utf8')
  const license = inferSpdxFromLicenseText(text)
  if (!license) return undefined
  return {
    name: path.basename(path.dirname(absPath)),
    version: '*',
    license,
    role: 'native',
    source: 'bundled-resource',
  }
}

/**
 * @param {string} root
 * @param {{ exists: (target: string) => boolean, readFile: Function, readdir?: Function }} fsApi
 * @returns {Record<string, string>}
 */
export function readNativeLicenseMap(root, existsOrFs, readFile) {
  const fsApi = typeof existsOrFs === 'function'
    ? { exists: existsOrFs, readFile, readdir: (dir) => fs.readdirSync(dir, { withFileTypes: true }) }
    : existsOrFs
  const licenses = {}
  const podsRoot = path.join(root, 'ios', 'Pods')
  if (fsApi.exists(podsRoot)) {
    for (const dirent of fsApi.readdir(podsRoot)) {
      if (!dirent.isDirectory?.()) continue
      const licensePath = firstExisting(
        [
          path.join(podsRoot, dirent.name, 'LICENSE'),
          path.join(podsRoot, dirent.name, 'LICENSE.md'),
          path.join(podsRoot, dirent.name, 'LICENSE.txt'),
        ],
        fsApi.exists,
      )
      if (!licensePath) continue
      const spdx = inferSpdxFromLicenseText(fsApi.readFile(licensePath, 'utf8'))
      if (spdx) licenses[dirent.name] = spdx
    }
  }
  const androidRoot = path.join(root, 'android')
  if (fsApi.exists(androidRoot)) {
    collectLicenseFiles(androidRoot, licenses, fsApi)
  }
  return licenses
}

function firstExisting(candidates, exists) {
  return candidates.find((candidate) => exists(candidate))
}

function collectLicenseFiles(dir, licenses, fsApi) {
  if (!fsApi.exists(dir)) return
  for (const filePath of listFiles(dir, fsApi, { skip: new Set(['build', '.gradle']) })) {
    const base = path.basename(filePath)
    if (!/^LICENSE(?:\..+)?$/i.test(base) && base !== 'NOTICE') continue
    const spdx = inferSpdxFromLicenseText(fsApi.readFile(filePath, 'utf8'))
    if (!spdx) continue
    licenses[path.basename(path.dirname(filePath))] = spdx
  }
}

function listFiles(dir, fsApi, options = {}) {
  const skip = options.skip ?? new Set()
  const out = []
  if (!fsApi.exists(dir)) return out
  const walk = (current) => {
    for (const dirent of fsApi.readdir(current)) {
      if (skip.has(dirent.name)) continue
      const abs = path.join(current, dirent.name)
      if (dirent.isDirectory?.()) {
        walk(abs)
        continue
      }
      out.push(abs)
    }
  }
  walk(dir)
  return out
}

function collectLockfileFingerprints(root, exists, readFile) {
  const lockfileFingerprints = {
    'pnpm-lock.yaml': fingerprintCommentValue(hashFile(root, 'pnpm-lock.yaml', readFile)),
  }
  const extras = [
    path.join('ios', 'Podfile.lock'),
    path.join('android', 'gradle.lockfile'),
    path.join('android', 'app', 'gradle.lockfile'),
    path.join('android', 'app', 'releaseRuntimeClasspath.txt'),
    path.join('android', 'notice-licenses.json'),
    path.join('android', 'app', 'notice-licenses.json'),
  ]
  for (const rel of extras) {
    if (!exists(path.join(root, rel))) continue
    lockfileFingerprints[rel] = fingerprintCommentValue(hashFile(root, rel, readFile))
  }
  return lockfileFingerprints
}

export function inferSpdxFromLicenseText(text) {
  if (/Mozilla Public License\s+2\.0/i.test(text)) return 'MPL-2.0'
  if (/Apache License[\s\S]{0,80}Version 2\.0/i.test(text)) return 'Apache-2.0'
  if (/Permission is hereby granted, free of charge/i.test(text)) return 'MIT'
  if (/THE SOFTWARE IS PROVIDED "AS IS"/i.test(text) && /IN NO EVENT SHALL/i.test(text)) {
    return 'MIT'
  }
  if (/Redistribution and use in source and binary forms/i.test(text)) {
    return 'BSD-3-Clause'
  }
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(text)) return 'LGPL-3.0-or-later'
  if (/GNU GENERAL PUBLIC LICENSE/i.test(text) && /Version 3/i.test(text)) {
    return 'GPL-3.0-or-later'
  }
  if (/ISC License/i.test(text)) return 'ISC'
  if (/SIL Open Font License/i.test(text)) return 'OFL-1.1'
  return undefined
}

function hashFile(root, rel, readFile) {
  const contents = readFile(path.join(root, rel))
  const buf = typeof contents === 'string' ? Buffer.from(contents) : contents
  return createHash('sha256').update(buf).digest('hex')
}

export function isExecutedAsCli(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  return Boolean(argv1) && metaUrl === pathToFileURL(path.resolve(argv1)).href
}

if (isExecutedAsCli()) {
  runGenerateNotices()
}
