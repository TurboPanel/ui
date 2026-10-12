#!/usr/bin/env node
/**
 * Set or check the version committed in this repo's files.
 *
 * Usage:
 *   node scripts/set-version.mjs X.Y.Z           rewrite every version field
 *   node scripts/set-version.mjs --check X.Y.Z   change nothing; exit 1 and
 *                                                print one line per file that
 *                                                disagrees
 *
 * The git tags work out what the next version should be (TurboPanel/dev's
 * Version From Tags action). The committed files must say the same thing:
 * the canary build in release.yml runs `--check` with that number and is
 * refused until they do. Right after a release the TurboPanel Release App
 * opens a "chore: start X.Y.Z" PR made with this script, and it merges
 * itself once its checks pass.
 *
 * Only the one version value in each file is rewritten (textually), so the
 * rest of the file keeps its formatting.
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(realScriptPath(fileURLToPath(import.meta.url))), '..')

const PLAIN_VERSION = /^\d+\.\d+\.\d+$/

/**
 * @typedef {{ file: string, pattern: RegExp, jsonPath?: string[] }} VersionField
 * `pattern` has three groups: before the value, the value, after the value.
 * `jsonPath`, for a JSON file, is where the value lives once parsed; a rewrite
 * that changes anything else in the parsed document is refused.
 */

/** @type {VersionField[]} */
export const VERSION_FIELDS = [
  { file: 'package.json', pattern: /^( {2}"version": ")([^"]*)(")/m, jsonPath: ['version'] },
  { file: 'app.json', pattern: /^( {4}"version": ")([^"]*)(")/m, jsonPath: ['expo', 'version'] },
  { file: 'sonar-project.properties', pattern: /^(sonar\.projectVersion=)(\S*)([ \t]*)$/m },
]

/** @param {string} version */
export function isPlainVersion(version) {
  return PLAIN_VERSION.test(version)
}

/**
 * @param {unknown} doc
 * @param {string[]} keys
 */
function valueAt(doc, keys) {
  return keys.reduce((node, key) => /** @type {any} */ (node)?.[key], doc)
}

/**
 * @param {unknown} doc
 * @param {string[]} keys
 * @param {string} value
 */
function withValueAt(doc, keys, value) {
  const copy = structuredClone(doc)
  let node = /** @type {Record<string, unknown>} */ (copy)
  for (const key of keys.slice(0, -1)) node = /** @type {Record<string, unknown>} */ (node[key])
  node[keys.at(-1)] = value
  return copy
}

/**
 * The version a file says, or throws when the field is missing (or, for JSON,
 * the line the pattern found is not the field it names).
 * @param {VersionField} field
 * @param {string} text
 */
export function readField(field, text) {
  const match = field.pattern.exec(text)
  if (!match) throw new Error(`${field.file}: no version field found`)
  const value = match[2]
  if (field.jsonPath && valueAt(JSON.parse(text), field.jsonPath) !== value) {
    throw new Error(`${field.file}: the version line found is not ${field.jsonPath.join('.')}`)
  }
  return value
}

/**
 * The file's text with its version field set to `version`.
 * @param {VersionField} field
 * @param {string} text
 * @param {string} version
 */
export function rewriteField(field, text, version) {
  readField(field, text)
  const next = text.replace(
    field.pattern,
    (_all, before, _value, after) => `${before}${version}${after}`
  )
  if (field.jsonPath) {
    const expected = JSON.stringify(withValueAt(JSON.parse(text), field.jsonPath, version))
    if (JSON.stringify(JSON.parse(next)) !== expected) {
      throw new Error(
        `${field.file}: rewriting the version would change more than ${field.jsonPath.join('.')}`
      )
    }
  }
  return next
}

/**
 * Rewrite every version field under `root`. Returns the files that changed.
 * @param {string} version
 * @param {string} [root]
 * @param {VersionField[]} [fields]
 */
export function setVersion(version, root = ROOT, fields = VERSION_FIELDS) {
  if (!isPlainVersion(version)) throw new Error(`not a plain X.Y.Z version: ${version}`)
  // Read and rewrite everything before writing anything, so a bad file leaves
  // the tree untouched.
  const updates = fields.map((field) => {
    const target = path.join(root, field.file)
    const text = readFileSync(target, 'utf8')
    return { file: field.file, target, text, next: rewriteField(field, text, version) }
  })
  const changed = []
  for (const update of updates) {
    if (update.next === update.text) continue
    writeFileSync(update.target, update.next)
    changed.push(update.file)
  }
  return changed
}

/**
 * One line per file whose version is not `version`; empty when they all agree.
 * @param {string} version
 * @param {string} [root]
 * @param {VersionField[]} [fields]
 */
export function checkVersion(version, root = ROOT, fields = VERSION_FIELDS) {
  if (!isPlainVersion(version)) throw new Error(`not a plain X.Y.Z version: ${version}`)
  const problems = []
  for (const field of fields) {
    const found = readField(field, readFileSync(path.join(root, field.file), 'utf8'))
    if (found !== version) {
      problems.push(
        `${field.file} says ${found}, the next version is ${version}: merge the "chore: start ${version}" PR (or run node scripts/set-version.mjs ${version} in a PR)`
      )
    }
  }
  return problems
}

/**
 * @param {string[]} args
 * @param {{ root?: string, log?: (line: string) => void, error?: (line: string) => void }} [io]
 * @returns {number} the exit code
 */
export function main(args, io = {}) {
  const { root = ROOT, log = console.log, error = console.error } = io
  const check = args[0] === '--check'
  const rest = check ? args.slice(1) : args
  if (rest.length !== 1 || !isPlainVersion(rest[0])) {
    error('usage: node scripts/set-version.mjs [--check] X.Y.Z')
    return 2
  }
  const version = rest[0]
  try {
    if (check) {
      const problems = checkVersion(version, root)
      for (const line of problems) error(line)
      if (problems.length > 0) return 1
      log(`every version field says ${version}`)
      return 0
    }
    const changed = setVersion(version, root)
    log(changed.length > 0 ? `set ${version} in ${changed.join(', ')}` : `already at ${version}`)
    return 0
  } catch (err) {
    error(/** @type {Error} */ (err).message)
    return 1
  }
}

export function isExecutedAsCli(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  return Boolean(argv1) && realScriptPath(fileURLToPath(metaUrl)) === realScriptPath(argv1)
}

/** A path with symlinks resolved (Node resolves import.meta.url, Deno does not); a missing path stays as given. */
function realScriptPath(p) {
  try {
    return realpathSync(path.resolve(p))
  } catch {
    return path.resolve(p)
  }
}

/**
 * @param {() => boolean} [isCli]
 * @param {string[]} [args]
 */
export function startCli(isCli = isExecutedAsCli, args = process.argv.slice(2)) {
  if (isCli()) process.exitCode = main(args)
}

startCli()
