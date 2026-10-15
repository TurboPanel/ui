import { describe, expect, it } from 'vitest'
import {
  filterSearchDestinations,
  isSearchShortcut,
  moveSearchIndex,
  searchDestinations,
  splitHighlight,
} from '@/lib/header-search'

const opts = { billingEnabled: true, projectsScopeId: 'all' }

describe('searchDestinations', () => {
  it('maps every destination to a real route', () => {
    const items = searchDestinations('o1', opts)
    expect(items.map((i) => [i.name, i.href])).toEqual([
      ['Projects', '/o1/projects'],
      ['Git sources', '/o1/projects/git-sources'],
      ['Repositories', '/o1/projects/repositories'],
      ['Project settings', '/o1/projects/settings'],
      ['Activity', '/o1/activity'],
      ['Servers', '/o1/servers'],
      ['Managed databases', '/o1/managed'],
      ['Network', '/o1/network'],
      ['Access', '/o1/access'],
      ['Organization settings', '/o1/manage'],
      ['Billing', '/o1/billing'],
    ])
  })

  it('hides Billing when the install has none', () => {
    const items = searchDestinations('o1', { ...opts, billingEnabled: false })
    expect(items.some((i) => i.id === 'billing')).toBe(false)
  })

  it('opens Projects on the current workspace scope', () => {
    const items = searchDestinations('o1', { ...opts, projectsScopeId: 'w1' })
    expect(items[0]?.href).toContain('w1')
  })
})

describe('filterSearchDestinations', () => {
  const items = searchDestinations('o1', opts)
  it('keeps everything for an empty query', () => {
    expect(filterSearchDestinations(items, '  ')).toHaveLength(items.length)
  })
  it('matches names case-insensitively', () => {
    expect(filterSearchDestinations(items, 'SET').map((i) => i.name)).toEqual([
      'Project settings',
      'Organization settings',
    ])
  })
  it('returns nothing when nothing matches', () => {
    expect(filterSearchDestinations(items, 'zzz')).toEqual([])
  })
})

describe('splitHighlight', () => {
  it('splits around the first match', () => {
    expect(splitHighlight('Git sources', 'SOU')).toEqual({
      before: 'Git ',
      match: 'sou',
      after: 'rces',
    })
  })
  it('returns the whole name without a match', () => {
    expect(splitHighlight('Git sources', 'x')).toEqual({
      before: 'Git sources',
      match: '',
      after: '',
    })
  })
})

describe('moveSearchIndex', () => {
  it('wraps both ways', () => {
    expect(moveSearchIndex(2, 3, 'down')).toBe(0)
    expect(moveSearchIndex(0, 3, 'up')).toBe(2)
    expect(moveSearchIndex(0, 0, 'down')).toBe(0)
  })
})

describe('isSearchShortcut', () => {
  const base = { metaKey: false, ctrlKey: false, targetIsTextField: false }
  it('accepts Cmd/Ctrl+K anywhere', () => {
    expect(isSearchShortcut({ ...base, key: 'k', metaKey: true, targetIsTextField: true })).toBe(true)
    expect(isSearchShortcut({ ...base, key: 'K', ctrlKey: true })).toBe(true)
  })
  it('accepts / only outside text fields', () => {
    expect(isSearchShortcut({ ...base, key: '/' })).toBe(true)
    expect(isSearchShortcut({ ...base, key: '/', targetIsTextField: true })).toBe(false)
  })
  it('ignores other keys', () => {
    expect(isSearchShortcut({ ...base, key: 'k' })).toBe(false)
  })
})
