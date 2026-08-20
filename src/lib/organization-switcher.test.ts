import { describe, expect, it } from 'vitest'
import {
  ORG_SWITCHER_HEADER_SEARCH_MIN,
  filterOrganizations,
  organizationLabel,
  organizationMatchesQuery,
  shouldShowOrgSwitcherSearch,
  sortOrganizationsForSwitcher,
  visibleOrganizations,
} from './organization-switcher'

const acme = { id: 'org-a', name: 'Acme Corp' }
const beta = { id: 'org-b', name: 'Beta Client' }
const unnamed = { id: 'org-uuid-9', name: null }

describe('organizationLabel', () => {
  it('uses a trimmed display name when present', () => {
    expect(organizationLabel({ id: 'x', name: '  Acme  ' })).toBe('Acme')
  })

  it('falls back to the id when the name is blank', () => {
    expect(organizationLabel({ id: 'org-1', name: '   ' })).toBe('org-1')
    expect(organizationLabel({ id: 'org-1', name: null })).toBe('org-1')
  })
})

describe('organizationMatchesQuery', () => {
  it('matches any org when the query is blank', () => {
    expect(organizationMatchesQuery(acme, '  ')).toBe(true)
  })

  it('matches display names case-insensitively', () => {
    expect(organizationMatchesQuery(acme, 'acme')).toBe(true)
    expect(organizationMatchesQuery(acme, 'CORP')).toBe(true)
    expect(organizationMatchesQuery(acme, 'zeta')).toBe(false)
  })

  it('matches organization ids', () => {
    expect(organizationMatchesQuery(unnamed, 'uuid-9')).toBe(true)
  })
})

describe('filterOrganizations', () => {
  it('returns orgs whose name or id contains the query', () => {
    const rows = filterOrganizations([acme, beta, unnamed], 'client')
    expect(rows).toEqual([beta])
  })
})

describe('sortOrganizationsForSwitcher', () => {
  it('pins the current org first, then sorts by name', () => {
    const rows = sortOrganizationsForSwitcher([beta, acme, unnamed], beta.id)
    expect(rows.map((org) => org.id)).toEqual([beta.id, acme.id, unnamed.id])
  })

  it('sorts A–Z when there is no current org', () => {
    const rows = sortOrganizationsForSwitcher([unnamed, beta, acme], null)
    expect(rows.map((org) => org.id)).toEqual([acme.id, beta.id, unnamed.id])
  })
})

describe('visibleOrganizations', () => {
  it('filters then pins the current match first', () => {
    const rows = visibleOrganizations(
      [acme, beta, { id: 'org-c', name: 'Acme West' }],
      'acme',
      'org-c',
    )
    expect(rows.map((org) => org.id)).toEqual(['org-c', 'org-a'])
  })
})

describe('shouldShowOrgSwitcherSearch', () => {
  it('shows search in the header from the minimum count', () => {
    expect(shouldShowOrgSwitcherSearch(ORG_SWITCHER_HEADER_SEARCH_MIN, false)).toBe(
      true,
    )
    expect(shouldShowOrgSwitcherSearch(1, false)).toBe(false)
  })

  it('always shows search on the full switcher when any org exists', () => {
    expect(shouldShowOrgSwitcherSearch(1, true)).toBe(true)
    expect(shouldShowOrgSwitcherSearch(0, true)).toBe(false)
  })
})
