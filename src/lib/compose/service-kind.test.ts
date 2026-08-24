import { describe, expect, it } from 'vitest'
import {
  isHostNativeServiceKind,
  isNodeComposeService,
  parseServiceTurbopanelExtension,
  patchServiceTurbopanelExtension,
  SERVICE_DESCRIPTION_MAX_LENGTH,
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
    expect(isHostNativeServiceKind('traditional-web')).toBe(true)
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

  it('clears railpack when the service becomes traditional-web', () => {
    const next = patchServiceTurbopanelExtension(RAILPACK_CONTAINER, {
      serviceKind: 'traditional-web',
      engine: 'nginx',
      root: 'public',
    })
    expect(next['x-turbopanel']).toEqual({
      serviceKind: 'traditional-web',
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
