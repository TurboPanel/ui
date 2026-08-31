import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from './types'
import {
  composeNetworkDriver,
  isComposeNetworkName,
  isSpanningComposeNetwork,
  nextComposeNetworkName,
  readComposeNetworks,
  renameComposeNetwork,
  setComposeNetworkDriver,
  writeComposeNetworks,
} from './networks-document'

function doc(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: [], comments: {} } }
}

describe('readComposeNetworks', () => {
  it('returns declared entries in document order', () => {
    const networks = readComposeNetworks(
      doc({
        networks: {
          frontend: { driver: 'overlay' },
          backend: { driver: 'bridge' },
        },
      }),
    )
    expect(Object.keys(networks)).toEqual(['frontend', 'backend'])
    expect(networks.frontend).toEqual({ driver: 'overlay' })
  })

  it('reads an empty or non-mapping entry as {}', () => {
    // `frontend:` with nothing under it is valid Compose; the editor still
    // needs an object to render and to write a driver onto.
    expect(
      readComposeNetworks(doc({ networks: { frontend: null, backend: 'nope' } })),
    ).toEqual({ frontend: {}, backend: {} })
  })

  it('is empty for a document with no usable networks block', () => {
    expect(readComposeNetworks(doc({}))).toEqual({})
    expect(readComposeNetworks(doc({ networks: [] }))).toEqual({})
    expect(readComposeNetworks(null)).toEqual({})
    expect(readComposeNetworks(undefined)).toEqual({})
    expect(
      readComposeNetworks({ version: 1, data: null } as unknown as ComposeDocument),
    ).toEqual({})
  })
})

describe('writeComposeNetworks', () => {
  it('replaces the whole block and leaves the rest of the document alone', () => {
    const next = writeComposeNetworks(
      doc({ services: { web: {} }, networks: { old: {} } }),
      { app: { driver: 'overlay' } },
    )
    expect(next.data).toEqual({
      services: { web: {} },
      networks: { app: { driver: 'overlay' } },
    })
  })

  it('removes the key rather than writing an empty mapping', () => {
    const next = writeComposeNetworks(doc({ networks: { app: {} } }), {})
    expect('networks' in next.data).toBe(false)
  })
})

describe('composeNetworkDriver', () => {
  it('reads a declared driver and trims it', () => {
    expect(composeNetworkDriver({ driver: ' overlay ' })).toBe('overlay')
  })

  it('is null when the entry declares no usable driver', () => {
    expect(composeNetworkDriver({})).toBeNull()
    expect(composeNetworkDriver({ driver: '   ' })).toBeNull()
    expect(composeNetworkDriver({ driver: 7 })).toBeNull()
  })
})

describe('isSpanningComposeNetwork', () => {
  it('is true only for driver: overlay', () => {
    expect(isSpanningComposeNetwork({ driver: 'overlay' })).toBe(true)
    expect(isSpanningComposeNetwork({ driver: 'bridge' })).toBe(false)
    expect(isSpanningComposeNetwork({})).toBe(false)
  })
})

describe('setComposeNetworkDriver', () => {
  it('sets the driver without disturbing other attributes', () => {
    expect(
      setComposeNetworkDriver({ labels: { a: 'b' } }, 'overlay'),
    ).toEqual({ labels: { a: 'b' }, driver: 'overlay' })
  })

  it('deletes the key rather than writing the default out', () => {
    expect(
      setComposeNetworkDriver({ driver: 'bridge', labels: {} }, null),
    ).toEqual({ labels: {} })
  })

  it('does not mutate the entry it was given', () => {
    const entry = { driver: 'bridge' }
    setComposeNetworkDriver(entry, 'overlay')
    expect(entry).toEqual({ driver: 'bridge' })
  })
})

describe('isComposeNetworkName', () => {
  it('accepts the Compose resource-name shape', () => {
    expect(isComposeNetworkName('frontend')).toBe(true)
    expect(isComposeNetworkName('front.end_1-a')).toBe(true)
    expect(isComposeNetworkName('9lives')).toBe(true)
  })

  it('refuses empty, leading-punctuation, and over-long names', () => {
    expect(isComposeNetworkName('')).toBe(false)
    expect(isComposeNetworkName('-front')).toBe(false)
    expect(isComposeNetworkName('front end')).toBe(false)
    expect(isComposeNetworkName('a'.repeat(64))).toBe(false)
  })
})

describe('nextComposeNetworkName', () => {
  it('uses the seed when it is free', () => {
    expect(nextComposeNetworkName([], 'App')).toBe('app')
  })

  it('suffixes past a collision', () => {
    expect(nextComposeNetworkName(['app', 'app-2'], 'app')).toBe('app-3')
  })

  it('falls back to a generic name when the seed folds to nothing usable', () => {
    expect(nextComposeNetworkName([], '  ')).toBe('network')
  })

  it('gives up on the suffix walk rather than looping forever', () => {
    const taken = ['app', ...Array.from({ length: 1000 }, (_, i) => `app-${i + 2}`)]
    expect(nextComposeNetworkName(taken, 'app')).toMatch(/^app-\d{10,}$/)
  })
})

describe('renameComposeNetwork', () => {
  it('keeps the renamed entry in its original position', () => {
    const renamed = renameComposeNetwork(
      { a: { driver: 'overlay' }, b: {}, c: {} },
      'b',
      'middle',
    )
    expect(Object.keys(renamed)).toEqual(['a', 'middle', 'c'])
  })
})
