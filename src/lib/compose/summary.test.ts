import { describe, expect, it } from 'vitest'
import {
  formatComposeSummaryChips,
  summarizeComposeDocument,
} from './summary'

describe('summarizeComposeDocument', () => {
  it('counts plain-object map keys under services, networks, and volumes', () => {
    expect(
      summarizeComposeDocument({
        version: 1,
        data: {
          services: {
            web: { image: 'nginx' },
            db: { image: 'postgres' },
          },
          networks: {
            frontend: { driver: 'bridge' },
          },
          volumes: {
            data: {},
          },
        },
        presentation: { keyOrder: [], comments: {} },
      }),
    ).toEqual({ services: 2, networks: 1, volumes: 1 })
  })

  it('ignores non-object and array map values', () => {
    expect(
      summarizeComposeDocument({
        version: 1,
        data: {
          services: {
            web: { image: 'nginx' },
            skip: null,
            also: ['not', 'a', 'service'],
          },
          networks: 'invalid',
          volumes: [{ name: 'bad' }],
        },
        presentation: { keyOrder: [], comments: {} },
      }),
    ).toEqual({ services: 1, networks: 0, volumes: 0 })
  })

  it('returns zeros for blank / null documents', () => {
    expect(summarizeComposeDocument(null)).toEqual({
      services: 0,
      networks: 0,
      volumes: 0,
    })
  })
})

describe('formatComposeSummaryChips', () => {
  it('uses singular and plural labels and omits zero counts', () => {
    expect(
      formatComposeSummaryChips({ services: 1, networks: 2, volumes: 0 }),
    ).toEqual([
      { key: 'services', label: '1 service' },
      { key: 'networks', label: '2 networks' },
    ])
  })

  it('returns an empty list when nothing is defined', () => {
    expect(
      formatComposeSummaryChips({ services: 0, networks: 0, volumes: 0 }),
    ).toEqual([])
  })

  it('includes volume chips when volumes are present', () => {
    expect(
      formatComposeSummaryChips({ services: 0, networks: 0, volumes: 1 }),
    ).toEqual([{ key: 'volumes', label: '1 volume' }])
    expect(
      formatComposeSummaryChips({ services: 2, networks: 1, volumes: 3 }),
    ).toEqual([
      { key: 'services', label: '2 services' },
      { key: 'networks', label: '1 network' },
      { key: 'volumes', label: '3 volumes' },
    ])
  })
})
