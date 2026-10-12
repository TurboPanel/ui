import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  VERSION_FIELDS,
  checkVersion,
  isExecutedAsCli,
  main,
  readField,
  rewriteField,
  setVersion,
  startCli,
} from './set-version.mjs'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const SCRIPT = path.join(ROOT, 'scripts', 'set-version.mjs')

function committedVersion(): string {
  return (JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string })
    .version
}

describe('set-version', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'set-version-'))
    for (const { file } of VERSION_FIELDS) copyFileSync(path.join(ROOT, file), path.join(dir, file))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const read = (file: string) => readFileSync(path.join(dir, file), 'utf8')

  it('covers package.json, app.json expo.version and sonar.projectVersion', () => {
    expect(VERSION_FIELDS.map((f) => f.file)).toEqual([
      'package.json',
      'app.json',
      'sonar-project.properties',
    ])
  })

  it('rewrites only the version value in every file', () => {
    const before = Object.fromEntries(VERSION_FIELDS.map(({ file }) => [file, read(file)]))
    expect(setVersion('9.8.7', dir)).toEqual([
      'package.json',
      'app.json',
      'sonar-project.properties',
    ])
    for (const field of VERSION_FIELDS) {
      expect(readField(field, read(field.file))).toBe('9.8.7')
      // Same text apart from the one number.
      expect(read(field.file).replace('9.8.7', committedVersion())).toBe(before[field.file])
    }
    expect((JSON.parse(read('app.json')) as { expo: { version: string } }).expo.version).toBe(
      '9.8.7'
    )
    expect(read('sonar-project.properties')).toMatch(/^sonar\.projectVersion=9\.8\.7$/m)
  })

  it('reports nothing to change when the files already say the version', () => {
    expect(setVersion(committedVersion(), dir)).toEqual([])
  })

  it('check passes when every file agrees and names each file that does not', () => {
    expect(checkVersion(committedVersion(), dir)).toEqual([])
    const problems = checkVersion('9.8.7', dir)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toBe(
      `package.json says ${committedVersion()}, the next version is 9.8.7: merge the "chore: start 9.8.7" PR (or run node scripts/set-version.mjs 9.8.7 in a PR)`
    )
    expect(problems[1]).toMatch(/^app\.json says /)
    expect(problems[2]).toMatch(/^sonar-project\.properties says /)
  })

  it('check changes nothing', () => {
    const before = read('app.json')
    checkVersion('9.8.7', dir)
    expect(read('app.json')).toBe(before)
  })

  it.each(['1.2', '1.2.3-rc.1', 'v1.2.3', '1.2.3-canary.4', ''])('refuses %j', (bad) => {
    expect(() => setVersion(bad, dir)).toThrow(/plain X\.Y\.Z/)
    expect(() => checkVersion(bad, dir)).toThrow(/plain X\.Y\.Z/)
  })

  it('refuses a JSON file whose matching line is not the named field, and writes nothing', () => {
    writeFileSync(
      path.join(dir, 'app.json'),
      '{\n  "expo": {\n    "name": "x"\n  },\n  "other": {\n    "version": "0.0.1"\n  }\n}\n'
    )
    const pkg = read('package.json')
    expect(() => setVersion('9.8.7', dir)).toThrow(
      /app\.json: the version line found is not expo\.version/
    )
    expect(read('package.json')).toBe(pkg)
  })

  it('refuses a rewrite that would change a different field holding the same number', () => {
    const field = {
      file: 'x.json',
      pattern: /^( {2}"version": ")([^"]*)(")/m,
      jsonPath: ['version'],
    }
    const text = '{\n"nested": {\n  "version": "1.0.0"\n},\n"version": "1.0.0"\n}\n'
    expect(() => rewriteField(field, text, '2.0.0')).toThrow(/would change more than version/)
  })

  it('refuses a file with no version field', () => {
    writeFileSync(path.join(dir, 'sonar-project.properties'), 'sonar.projectKey=x\n')
    expect(() => checkVersion('9.8.7', dir)).toThrow(/no version field/)
  })

  it('main returns the exit codes the workflows rely on', () => {
    const out: string[] = []
    const io = { root: dir, log: (l: string) => out.push(l), error: (l: string) => out.push(l) }
    expect(main(['--check', committedVersion()], io)).toBe(0)
    expect(main(['--check', '9.8.7'], io)).toBe(1)
    expect(main(['nope'], io)).toBe(2)
    expect(main([], io)).toBe(2)
    expect(main(['9.8.7'], io)).toBe(0)
    expect(main(['--check', '9.8.7'], io)).toBe(0)
    expect(main(['9.8.7'], io)).toBe(0)
    expect(out).toContain('already at 9.8.7')
    rmSync(path.join(dir, 'app.json'))
    expect(main(['--check', '9.8.7'], io)).toBe(1)
  })

  it('defaults to the real tree and the console', () => {
    expect(checkVersion(committedVersion())).toEqual([])
    expect(setVersion(committedVersion())).toEqual([])
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(main(['--check', committedVersion()])).toBe(0)
      expect(log).toHaveBeenCalledWith(`every version field says ${committedVersion()}`)
      startCli(() => true, ['nope'])
      expect(process.exitCode).toBe(2)
      expect(error).toHaveBeenCalledWith('usage: node scripts/set-version.mjs [--check] X.Y.Z')
      startCli(() => false, ['nope'])
    } finally {
      process.exitCode = undefined
      log.mockRestore()
      error.mockRestore()
    }
  })

  it('runs as a CLI against the real tree', () => {
    expect(isExecutedAsCli('file:///nowhere.mjs', '/elsewhere.mjs')).toBe(false)
    const ok = spawnSync(process.execPath, [SCRIPT, '--check', committedVersion()], {
      encoding: 'utf8',
    })
    expect(ok.status).toBe(0)
    const bad = spawnSync(process.execPath, [SCRIPT, '--check', '0.0.0'], { encoding: 'utf8' })
    expect(bad.status).toBe(1)
    expect(bad.stderr).toContain('merge the "chore: start 0.0.0" PR')
  })

  it('still runs, and still fails a wrong version, when called through a symlink', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'set-version-link-'))
    try {
      const link = path.join(dir, 'set-version.mjs')
      symlinkSync(SCRIPT, link)
      const bad = spawnSync(process.execPath, [link, '--check', '0.0.0'], { encoding: 'utf8' })
      expect(bad.status).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
