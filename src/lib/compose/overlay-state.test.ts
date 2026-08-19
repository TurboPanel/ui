import { describe, expect, it } from 'vitest'
import { resolveComposeOverlayState } from './overlay-state'

describe('resolveComposeOverlayState', () => {
  it('marks a blank overlay as blank', () => {
    expect(resolveComposeOverlayState(null)).toEqual({
      blank: true,
      overriddenKeys: [],
      serviceNames: [],
    })
    expect(resolveComposeOverlayState({ version: 1, data: {}, presentation: { keyOrder: [], comments: {} } })).toEqual({
      blank: true,
      overriddenKeys: [],
      serviceNames: [],
    })
  })

  it('surfaces a service override name when only services are set', () => {
    const state = resolveComposeOverlayState({
      version: 1,
      data: {
        services: {
          api: { image: 'api:latest' },
        },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    })
    expect(state.blank).toBe(false)
    expect(state.overriddenKeys).toEqual(['services'])
    expect(state.serviceNames).toEqual(['api'])
  })

  it('includes non-service top-level keys in overriddenKeys', () => {
    const state = resolveComposeOverlayState({
      version: 1,
      data: {
        networks: {
          backend: { driver: 'bridge' },
        },
        services: {
          web: { image: 'nginx:alpine' },
        },
      },
      presentation: { keyOrder: ['networks', 'services'], comments: {} },
    })
    expect(state.blank).toBe(false)
    expect(state.overriddenKeys).toEqual(['networks', 'services'])
    expect(state.serviceNames).toEqual(['web'])
  })

  it('returns no service names when services is not a mapping', () => {
    const state = resolveComposeOverlayState({
      version: 1,
      data: {
        services: 'invalid',
        networks: { front: {} },
      },
      presentation: { keyOrder: ['services', 'networks'], comments: {} },
    })
    expect(state.blank).toBe(false)
    expect(state.serviceNames).toEqual([])
    expect(state.overriddenKeys).toEqual(['networks', 'services'])
  })
})
