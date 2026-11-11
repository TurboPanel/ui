import { describe, expect, it } from 'vitest'
import {
  parseReachPort,
  reachCandidates,
  reachSelectable,
  reachDecision,
  toggleReachName,
} from '@/lib/compose/reach'
import {
  isValidReachValue,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  serviceKindFieldMessage,
} from '@/lib/compose/service-kind'

describe('reach value', () => {
  it('accepts a port and one to eight distinct names', () => {
    expect(isValidReachValue({ port: 6379, from: ['web'] })).toBe(true)
    expect(isValidReachValue({ port: 65535, from: ['a.b', 'c_d', 'e-f'] })).toBe(true)
  })

  it('refuses everything else', () => {
    expect(isValidReachValue(null)).toBe(false)
    expect(isValidReachValue({ port: 0, from: ['web'] })).toBe(false)
    expect(isValidReachValue({ port: 65536, from: ['web'] })).toBe(false)
    expect(isValidReachValue({ port: 80.5, from: ['web'] })).toBe(false)
    expect(isValidReachValue({ port: 80, from: [] })).toBe(false)
    expect(isValidReachValue({ port: 80, from: ['web', 'web'] })).toBe(false)
    expect(isValidReachValue({ port: 80, from: ['bad name'] })).toBe(false)
    expect(
      isValidReachValue({ port: 80, from: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] })
    ).toBe(false)
  })
})

describe('reach in the service block', () => {
  it('is a container field only', () => {
    expect(serviceKindFieldMessage('reach', undefined)).toBeNull()
    expect(serviceKindFieldMessage('reach', 'container')).toBeNull()
    expect(serviceKindFieldMessage('reach', 'site')).toBe(
      'reach is only valid when serviceKind is container'
    )
  })

  it('survives a read and a write, and is removed by an undefined patch', () => {
    const service = { image: 'valkey', 'x-turbopanel': { reach: { port: 6379, from: ['web'] } } }
    expect(readServiceTurbopanelExtension(service)?.reach).toEqual({ port: 6379, from: ['web'] })
    const kept = patchServiceTurbopanelExtension(service, { description: 'cache helper' })
    expect(readServiceTurbopanelExtension(kept)?.reach).toEqual({ port: 6379, from: ['web'] })
    const cleared = patchServiceTurbopanelExtension(service, { reach: undefined })
    expect(readServiceTurbopanelExtension(cleared)?.reach).toBeUndefined()
  })

  it('is dropped when the service becomes a site', () => {
    const service = { image: 'x', 'x-turbopanel': { reach: { port: 80, from: ['web'] } } }
    const next = patchServiceTurbopanelExtension(service, { serviceKind: 'site' })
    expect(readServiceTurbopanelExtension(next)?.reach).toBeUndefined()
  })
})

describe('reach editing', () => {
  it('reads the typed port', () => {
    expect(parseReachPort(' 6379 ')).toBe(6379)
    expect(parseReachPort('0')).toBeNull()
    expect(parseReachPort('70000')).toBeNull()
    expect(parseReachPort('80a')).toBeNull()
    expect(parseReachPort('')).toBeNull()
  })

  it('offers only sites and Node apps, with the account each runs as', () => {
    expect(
      reachCandidates({
        web: { kind: 'site', account: 'blog' },
        api: { kind: 'node' },
        cache: { kind: 'container' },
        db: {},
      })
    ).toEqual([
      { name: 'web', account: 'blog' },
      { name: 'api', account: null },
    ])
  })

  it('limits the choice to one account once a name is chosen', () => {
    const list = [
      { name: 'web', account: 'blog' },
      { name: 'api', account: 'blog' },
      { name: 'shop', account: 'store' },
      { name: 'bare', account: null },
    ]
    expect(reachSelectable(list, [], 'shop')).toBe(true)
    expect(reachSelectable(list, ['web'], 'api')).toBe(true)
    expect(reachSelectable(list, ['web'], 'shop')).toBe(false)
    expect(reachSelectable(list, ['web'], 'bare')).toBe(false)
    expect(reachSelectable(list, ['web'], 'web')).toBe(true)
    expect(reachSelectable(list, ['gone'], 'shop')).toBe(true)
  })

  it('toggles names and stops at eight', () => {
    expect(toggleReachName(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleReachName(['a', 'b'], 'a')).toEqual(['b'])
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(toggleReachName(eight, 'i')).toEqual(eight)
  })

  it('decides what to write', () => {
    expect(reachDecision('', [])).toEqual({ reach: undefined, issue: null })
    expect(reachDecision('6379', ['web'])).toEqual({
      reach: { port: 6379, from: ['web'] },
      issue: null,
    })
    expect(reachDecision('x', ['web']).issue).toBe('Enter a port from 1 to 65535.')
    expect(reachDecision('6379', []).issue).toBe('Choose at least one site or app.')
    expect(reachDecision('6379', ['bad name']).issue).toContain('once')
  })
})
