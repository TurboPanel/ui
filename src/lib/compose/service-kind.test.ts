import { describe, expect, it } from 'vitest'
import {
  ALLOWED_PHP_EXTENSIONS,
  BASELINE_PHP_EXTENSIONS,
  DEFAULT_PHP_SERIES,
  OPTIONAL_PHP_EXTENSIONS,
  SUPPORTED_PHP_SERIES,
  isHostNativeServiceKind,
  isNodeComposeService,
  isSiteComposeService,
  parseServiceSourceExtension,
  parseServiceTurbopanelExtension,
  patchServiceTurbopanelExtension,
  readServiceSourceExtension,
  readServiceTurbopanelExtension,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SOURCE_BRANCH_MAX_LENGTH,
  SOURCE_COMMAND_MAX_LENGTH,
} from './service-kind'

describe('patchServiceTurbopanelExtension description', () => {
  it('stores a trimmed description within the max length', () => {
    const next = patchServiceTurbopanelExtension(
      { image: 'nginx' },
      { description: '  API gateway  ' }
    )
    expect(next['x-turbopanel']).toEqual({ description: 'API gateway' })
  })

  it('truncates an overlong description so parse never drops it', () => {
    const overlong = `${'x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH)}EXTRA`
    const next = patchServiceTurbopanelExtension({ image: 'nginx' }, { description: overlong })
    const extension = next['x-turbopanel'] as Record<string, unknown>
    expect(typeof extension.description).toBe('string')
    expect(extension.description as string).toHaveLength(SERVICE_DESCRIPTION_MAX_LENGTH)
    expect(parseServiceTurbopanelExtension(extension)?.description).toBe(extension.description)
  })

  it('clears description when empty after trim', () => {
    const next = patchServiceTurbopanelExtension(
      {
        image: 'nginx',
        'x-turbopanel': { description: 'was here' },
      },
      { description: '   ' }
    )
    expect(Object.hasOwn(next, 'x-turbopanel')).toBe(false)
  })
})

describe('serviceKind: node', () => {
  it('parses the framework and pinned node version', () => {
    const parsed = parseServiceTurbopanelExtension({
      serviceKind: 'node',
      framework: 'next',
      nodeVersion: '24.17.0',
    })
    expect(parsed?.serviceKind).toBe('node')
    expect(parsed?.framework).toBe('next')
    expect(parsed?.nodeVersion).toBe('24.17.0')
  })

  it('drops an unpinned node version and an unknown framework', () => {
    const parsed = parseServiceTurbopanelExtension({
      serviceKind: 'node',
      framework: 'deno',
      nodeVersion: '^24',
    })
    expect(parsed?.framework).toBeUndefined()
    expect(parsed?.nodeVersion).toBeUndefined()
  })

  it('clears node-only fields when the kind changes away from node', () => {
    const service = patchServiceTurbopanelExtension(
      {},
      {
        serviceKind: 'node',
        framework: 'next',
        nodeVersion: '24',
      }
    )
    const reverted = patchServiceTurbopanelExtension(service, {
      serviceKind: 'container',
    })
    expect(reverted['x-turbopanel']).toEqual({ serviceKind: 'container' })
  })

  it('recognizes node as a host-native kind that needs no image or build', () => {
    expect(isNodeComposeService({ 'x-turbopanel': { serviceKind: 'node' } })).toBe(true)
    expect(isHostNativeServiceKind('node')).toBe(true)
    expect(isHostNativeServiceKind('site')).toBe(true)
    expect(isHostNativeServiceKind('container')).toBe(false)
  })
})

describe('x-turbopanel.source.buildKind', () => {
  it('parses railpack and keeps the rest of the binding', () => {
    const parsed = parseServiceTurbopanelExtension({
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
        buildKind: 'railpack',
      },
    })
    expect(parsed?.source?.buildKind).toBe('railpack')
    expect(parsed?.source?.branch).toBe('main')
  })

  it('omits the field entirely when the value is unknown', () => {
    const parsed = parseServiceTurbopanelExtension({
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        buildKind: 'nixpacks',
      },
    })
    // Dropped rather than defaulted, so the instance validator is the one place
    // that decides an unknown value is an error.
    expect(parsed?.source).toEqual({
      sourceId: '11111111-2222-3333-4444-555555555555',
    })
  })

  it('round-trips through the extension patch layer', () => {
    const next = patchServiceTurbopanelExtension(
      {},
      {
        serviceKind: 'container',
        source: {
          sourceId: '11111111-2222-3333-4444-555555555555',
          buildKind: 'railpack',
        },
      }
    )
    expect(next['x-turbopanel']).toEqual({
      serviceKind: 'container',
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        buildKind: 'railpack',
      },
    })
  })
})

describe('buildKind normalization across a service-kind switch', () => {
  const RAILPACK_CONTAINER = {
    image: 'nginx:alpine',
    'x-turbopanel': {
      serviceKind: 'container',
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
        buildKind: 'railpack',
      },
    },
  }

  it('clears railpack when the service becomes node', () => {
    // The Services form hides the Railpack control once the kind leaves
    // container, so a surviving `buildKind` would be invisible right up until
    // the instance rejected the document on save.
    const next = patchServiceTurbopanelExtension(RAILPACK_CONTAINER, {
      serviceKind: 'node',
      framework: 'auto',
    })
    expect(next['x-turbopanel']).toEqual({
      serviceKind: 'node',
      framework: 'auto',
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
      },
    })
  })

  it('clears railpack when the service becomes site', () => {
    const next = patchServiceTurbopanelExtension(RAILPACK_CONTAINER, {
      serviceKind: 'site',
      engine: 'nginx',
      root: 'public',
    })
    expect(next['x-turbopanel']).toEqual({
      serviceKind: 'site',
      engine: 'nginx',
      root: 'public',
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
      },
    })
  })

  it('keeps railpack when the service stays a container', () => {
    const next = patchServiceTurbopanelExtension(RAILPACK_CONTAINER, {
      description: 'api',
    })
    expect((next['x-turbopanel'] as { source: { buildKind?: string } }).source.buildKind).toBe(
      'railpack'
    )
  })

  it('restores the option when the service comes back to container', () => {
    const native = patchServiceTurbopanelExtension(RAILPACK_CONTAINER, {
      serviceKind: 'node',
      framework: 'auto',
    })
    const back = patchServiceTurbopanelExtension(native, { serviceKind: 'container' })
    // The binding survives the round trip; the build backend does not, because
    // it was cleared on the way out rather than hidden.
    expect(back['x-turbopanel']).toEqual({
      serviceKind: 'container',
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
      },
    })
  })
})

describe('PHP extension lists', () => {
  it('keeps baseline and optional disjoint', () => {
    // A name in both would render as an opt-in chip for something already
    // installed, which tells the operator the wrong thing about what their
    // choice does.
    const overlap = BASELINE_PHP_EXTENSIONS.filter((name) =>
      OPTIONAL_PHP_EXTENSIONS.includes(name)
    )
    expect(overlap).toEqual([])
  })

  it('exposes ALLOWED as exactly the union', () => {
    expect([...ALLOWED_PHP_EXTENSIONS].sort()).toEqual(
      [...BASELINE_PHP_EXTENSIONS, ...OPTIONAL_PHP_EXTENSIONS].sort(),
    )
  })

  it('excludes the extensions that are refused on purpose', () => {
    // xdebug leaks source and is a severe perf cost; ffi and pcntl change what
    // a pool can do to the host. Adding one needs a reason written down.
    for (const refused of ['xdebug', 'ffi', 'pcntl']) {
      expect(ALLOWED_PHP_EXTENSIONS).not.toContain(refused)
    }
  })

  it('offers only series the instance supports', () => {
    expect(SUPPORTED_PHP_SERIES).toContain(DEFAULT_PHP_SERIES)
  })
})

describe('parseServiceTurbopanelExtension shapes', () => {
  it('parses cron jobs and drops incomplete entries', () => {
    const parsed = parseServiceTurbopanelExtension({
      serviceKind: 'site',
      cron: [
        { name: 'nightly', schedule: '0 0 * * *', command: '/usr/bin/true' },
        { name: '', schedule: '0 0 * * *', command: '/usr/bin/true' },
        { name: 'ok', schedule: '  ', command: '/usr/bin/true' },
        'not-a-job',
      ],
    })
    expect(parsed?.cron).toEqual([
      { name: 'nightly', schedule: '0 0 * * *', command: '/usr/bin/true' },
    ])
    expect(parseServiceTurbopanelExtension({ cron: 'nope' })?.cron).toBeUndefined()
  })

  it('parses php extensions, settings, and pool maps', () => {
    const parsed = parseServiceTurbopanelExtension({
      serviceKind: 'site',
      php: {
        version: '8.4',
        extensions: ['REDIS', ' redis ', '', 12],
        settings: { memory_limit: '128M', skip: true, workers: 2 },
        pool: { 'pm.max_children': 5 },
      },
    })
    expect(parsed?.php).toEqual({
      version: '8.4',
      extensions: ['redis'],
      settings: { memory_limit: '128M', workers: 2 },
      pool: { 'pm.max_children': 5 },
    })
    expect(parseServiceTurbopanelExtension({ php: [] })?.php).toBeUndefined()
    expect(
      parseServiceTurbopanelExtension({ php: { settings: { skip: true } } })?.php,
    ).toBeUndefined()
  })

  it('keeps a managed-directory sourceKind on a site', () => {
    const parsed = parseServiceTurbopanelExtension({
      serviceKind: 'site',
      sourceKind: 'managed-directory',
    })
    expect(parsed?.sourceKind).toBe('managed-directory')
    expect(
      parseServiceTurbopanelExtension({ sourceKind: 'bucket' })?.sourceKind,
    ).toBeUndefined()
    expect(
      parseServiceTurbopanelExtension({ sourceKind: 1 })?.sourceKind,
    ).toBeUndefined()
  })

  it('drops a source block without a usable sourceId', () => {
    expect(parseServiceSourceExtension(null)).toBeNull()
    expect(parseServiceSourceExtension('nope')).toBeNull()
    expect(
      parseServiceSourceExtension({ sourceId: 'not-a-uuid' }),
    ).toBeNull()
  })

  it('keeps in-range source strings and skips empty or overlong ones', () => {
    const sourceId = '11111111-2222-3333-4444-555555555555'
    const parsed = parseServiceSourceExtension({
      sourceId,
      branch: '  main  ',
      subdirectory: 'x'.repeat(201),
      buildCommand: 'pnpm build',
      startCommand: '',
      outputDirectory: 'dist',
    })
    expect(parsed).toEqual({
      sourceId,
      branch: 'main',
      buildCommand: 'pnpm build',
      outputDirectory: 'dist',
    })
    expect(
      parseServiceSourceExtension({
        sourceId,
        branch: 'b'.repeat(SOURCE_BRANCH_MAX_LENGTH + 1),
        buildCommand: 'c'.repeat(SOURCE_COMMAND_MAX_LENGTH + 1),
      }),
    ).toEqual({ sourceId })
  })

  it('reads the source binding off a service and treats a non-map extension as absent', () => {
    const sourceId = '11111111-2222-3333-4444-555555555555'
    expect(
      readServiceSourceExtension({
        'x-turbopanel': { source: { sourceId } },
      })?.sourceId,
    ).toBe(sourceId)
    expect(isSiteComposeService({ 'x-turbopanel': 5 })).toBe(false)
    expect(isNodeComposeService({ 'x-turbopanel': 5 })).toBe(false)
    expect(readServiceTurbopanelExtension({ image: 'nginx' })).toEqual({})
    expect(parseServiceTurbopanelExtension(null)).toEqual({})
  })
})

describe('patchServiceTurbopanelExtension cron and php', () => {
  it('stores cron jobs on a host-native service and drops them on a container', () => {
    const withCron = patchServiceTurbopanelExtension(
      {},
      {
        serviceKind: 'site',
        engine: 'caddy',
        cron: [{ name: 'nightly', schedule: '0 0 * * *', command: '/usr/bin/true' }],
      },
    )
    expect(withCron['x-turbopanel']).toEqual({
      serviceKind: 'site',
      engine: 'caddy',
      cron: [{ name: 'nightly', schedule: '0 0 * * *', command: '/usr/bin/true' }],
    })
    const asContainer = patchServiceTurbopanelExtension(withCron, {
      serviceKind: 'container',
    })
    expect(asContainer['x-turbopanel']).toEqual({ serviceKind: 'container' })
  })

  it('stores php settings and clears the binding with source: null', () => {
    const withPhp = patchServiceTurbopanelExtension(
      {},
      {
        serviceKind: 'site',
        engine: 'nginx',
        php: { version: '8.4', extensions: ['redis'] },
        source: {
          sourceId: '11111111-2222-3333-4444-555555555555',
          branch: 'main',
        },
      },
    )
    expect(withPhp['x-turbopanel']).toMatchObject({
      php: { version: '8.4', extensions: ['redis'] },
      source: {
        sourceId: '11111111-2222-3333-4444-555555555555',
        branch: 'main',
      },
    })
    const cleared = patchServiceTurbopanelExtension(withPhp, { source: null })
    expect(
      (cleared['x-turbopanel'] as { source?: unknown }).source,
    ).toBeUndefined()
  })
})
