import { describe, expect, it } from 'vitest'
import { makeComposeTag } from '@/lib/compose/tags'
import { emptyComposeDocument, type ComposeDocument } from '@/lib/compose/types'
import { environmentFollowsBase, environmentStandsAlone } from './follows-base'

function compose(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: Object.keys(data), comments: {} } }
}

describe('derived follows the Base / stands alone', () => {
  it.each([
    ['no saved compose', null],
    ['an undefined compose', undefined],
    ['an empty compose', emptyComposeDocument()],
    ['something that is not a compose document', { services: {} }],
  ])('follows the Base with %s', (_name, value) => {
    expect(environmentStandsAlone(value)).toBe(false)
    expect(environmentFollowsBase(value)).toBe(true)
  })

  it('follows the Base when the environment only adds or changes services', () => {
    const doc = compose({ services: { web: { command: 'next start' } } })
    expect(environmentStandsAlone(doc)).toBe(false)
  })

  it('follows the Base when only variables or other blocks are set', () => {
    expect(environmentStandsAlone(compose({ networks: { back: {} } }))).toBe(false)
  })

  it('stands alone when the whole services block is replaced (empty)', () => {
    const doc = compose({ services: makeComposeTag('override', {}) })
    expect(environmentStandsAlone(doc)).toBe(true)
    expect(environmentFollowsBase(doc)).toBe(false)
  })

  it('stands alone when the whole services block is replaced (with services)', () => {
    const doc = compose({ services: makeComposeTag('override', { web: { image: 'nginx' } }) })
    expect(environmentStandsAlone(doc)).toBe(true)
  })

  it('still follows the Base when only one service is replaced', () => {
    const doc = compose({ services: { web: makeComposeTag('override', { image: 'nginx' }) } })
    expect(environmentStandsAlone(doc)).toBe(false)
  })

  it('follows the Base when services are removed with a reset (it still merges over the Base)', () => {
    const doc = compose({ services: makeComposeTag('reset', null) })
    expect(environmentStandsAlone(doc)).toBe(false)
  })
})
