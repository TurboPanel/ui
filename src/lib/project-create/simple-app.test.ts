import { describe, expect, it } from 'vitest'
import type { RepositoryInspection, RepositoryProbedFile } from '@/lib/instance-api'
import {
  detectPackageManager,
  isNodeApp,
  readPackageScripts,
  suggestedSimpleAppConfig,
} from '@/lib/project-create/simple-app'

function found(path: string, content?: string): RepositoryProbedFile {
  return { path, found: true, ...(content === undefined ? {} : { content }) }
}

function missing(path: string): RepositoryProbedFile {
  return { path, found: false, reason: 'not_found' }
}

/** Probed as existing, but the content refused to ride along. */
function refused(
  path: string,
  reason: 'too_large' | 'binary',
): RepositoryProbedFile {
  return { path, found: false, reason }
}

function inspection(
  files: RepositoryProbedFile[],
  entries: { path: string; kind: 'file' | 'dir' }[] = [],
): RepositoryInspection {
  return { commitSha: 'abc123', via: 'provider', files, entries }
}

describe('detectPackageManager', () => {
  it('names the manager from the lockfile', () => {
    expect(detectPackageManager([found('package-lock.json')])).toEqual({
      manager: 'npm',
      evidence: 'package-lock.json',
    })
    expect(detectPackageManager([found('yarn.lock')])).toEqual({
      manager: 'yarn',
      evidence: 'yarn.lock',
    })
    expect(detectPackageManager([found('pnpm-lock.yaml')])).toEqual({
      manager: 'pnpm',
      evidence: 'pnpm-lock.yaml',
    })
  })

  it('uses the daemon precedence when several lockfiles exist: pnpm > yarn > npm', () => {
    const files = [
      found('package-lock.json'),
      found('yarn.lock'),
      found('pnpm-lock.yaml'),
    ]
    expect(detectPackageManager(files)?.manager).toBe('pnpm')
  })

  it('counts a lockfile too large to ride along — it still exists', () => {
    // Real pnpm lockfiles routinely blow the probe's per-file cap; the probe
    // answers `too_large`, which used to read as "no lockfile" → npm.
    expect(detectPackageManager([refused('pnpm-lock.yaml', 'too_large')]))
      .toEqual({ manager: 'pnpm', evidence: 'pnpm-lock.yaml' })
    expect(detectPackageManager([refused('yarn.lock', 'binary')]))
      .toEqual({ manager: 'yarn', evidence: 'yarn.lock' })
  })

  it('reports nothing when no lockfile was found', () => {
    expect(detectPackageManager([missing('pnpm-lock.yaml'), found('package.json')]))
      .toBeUndefined()
  })

  it('ignores a probed-but-absent lockfile', () => {
    expect(detectPackageManager([missing('yarn.lock')])).toBeUndefined()
  })

  it('falls back to the packageManager pin when no lockfile speaks', () => {
    const files = [
      found('package.json', JSON.stringify({ packageManager: 'pnpm@11.22.0' })),
    ]
    expect(detectPackageManager(files)).toEqual({
      manager: 'pnpm',
      evidence: 'packageManager',
    })
  })

  it('lets the lockfile beat a disagreeing packageManager pin', () => {
    // The daemon detects from the lockfile on disk at build time, so the
    // suggestion must agree with what the build will actually do.
    const files = [
      found('package.json', JSON.stringify({ packageManager: 'pnpm@11.22.0' })),
      found('yarn.lock'),
    ]
    expect(detectPackageManager(files)?.manager).toBe('yarn')
  })

  it('ignores a packageManager pin naming an unsupported manager', () => {
    const files = [
      found('package.json', JSON.stringify({ packageManager: 'bun@1.2.0' })),
    ]
    expect(detectPackageManager(files)).toBeUndefined()
  })
})

describe('readPackageScripts', () => {
  it('reads build and start scripts', () => {
    const files = [
      found(
        'package.json',
        JSON.stringify({ scripts: { build: 'vite build', start: 'node server.js' } }),
      ),
    ]
    expect(readPackageScripts(files)).toEqual({
      build: 'vite build',
      start: 'node server.js',
    })
  })

  it('drops non-string script values', () => {
    const files = [found('package.json', JSON.stringify({ scripts: { build: 42 } }))]
    expect(readPackageScripts(files)).toEqual({})
  })

  it('returns undefined for unparseable or content-less package.json', () => {
    expect(readPackageScripts([found('package.json', 'not json')])).toBeUndefined()
    // Content omitted (e.g. too large to ride along).
    expect(readPackageScripts([found('package.json')])).toBeUndefined()
    expect(readPackageScripts([missing('package.json')])).toBeUndefined()
  })
})

describe('suggestedSimpleAppConfig', () => {
  it('prefills manager-aware commands for a node app with scripts', () => {
    const config = suggestedSimpleAppConfig(
      inspection([
        found(
          'package.json',
          JSON.stringify({ scripts: { build: 'next build', start: 'next start' } }),
        ),
        found('pnpm-lock.yaml'),
      ]),
    )
    expect(config.kind).toBe('web')
    expect(config.buildCommand).toBe('pnpm run build')
    expect(config.startCommand).toBe('pnpm start')
  })

  it('suggests no command the package.json does not declare', () => {
    const config = suggestedSimpleAppConfig(
      inspection([found('package.json', JSON.stringify({ scripts: {} }))]),
    )
    expect(config.buildCommand).toBe('')
    expect(config.startCommand).toBe('')
  })

  it('prefills pnpm commands when only the too-large lockfile names it', () => {
    const config = suggestedSimpleAppConfig(
      inspection([
        found(
          'package.json',
          JSON.stringify({
            packageManager: 'pnpm@11.22.0',
            scripts: { build: 'next build', start: 'next start' },
          }),
        ),
        refused('pnpm-lock.yaml', 'too_large'),
      ]),
    )
    expect(config.buildCommand).toBe('pnpm run build')
    expect(config.startCommand).toBe('pnpm start')
  })

  it('defaults to npm when no lockfile names a manager', () => {
    const config = suggestedSimpleAppConfig(
      inspection([
        found('package.json', JSON.stringify({ scripts: { build: 'tsc', start: 'node .' } })),
      ]),
    )
    expect(config.buildCommand).toBe('npm run build')
    expect(config.startCommand).toBe('npm start')
  })

  it('starts a static-only repository on the static kind with its directory', () => {
    const config = suggestedSimpleAppConfig(
      inspection([found('index.html')], [{ path: 'public', kind: 'dir' }]),
    )
    expect(config.kind).toBe('static')
    expect(config.outputDirectory).toBe('public')
  })

  it('keeps a node app on the web kind even when dist/ exists', () => {
    const config = suggestedSimpleAppConfig(
      inspection(
        [found('package.json', '{}')],
        [{ path: 'dist', kind: 'dir' }],
      ),
    )
    expect(config.kind).toBe('web')
    expect(config.outputDirectory).toBe('dist')
  })

  it('handles a missing inspection (failed read) with quiet defaults', () => {
    const config = suggestedSimpleAppConfig(undefined)
    expect(config).toEqual({
      kind: 'web',
      buildRoot: '',
      buildCommand: '',
      startCommand: '',
      outputDirectory: '',
    })
  })
})

describe('isNodeApp', () => {
  it('is true only for a found package.json', () => {
    expect(isNodeApp([found('package.json')])).toBe(true)
    expect(isNodeApp([missing('package.json')])).toBe(false)
    expect(isNodeApp([])).toBe(false)
  })
})
