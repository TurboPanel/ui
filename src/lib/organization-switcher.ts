import type { OrganizationRecord } from '@/lib/instance-api'

/** Up to this many organizations fit in the menu without scrolling. */
export const ORG_SWITCHER_LONG_LIST_MIN = 8

export function organizationLabel(
  org: Pick<OrganizationRecord, 'id' | 'name'>,
): string {
  return org.name?.trim() || org.id
}

export function organizationMatchesQuery(
  org: Pick<OrganizationRecord, 'id' | 'name'>,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  const name = organizationLabel(org).toLowerCase()
  return name.includes(needle) || org.id.toLowerCase().includes(needle)
}

export function filterOrganizations<
  T extends Pick<OrganizationRecord, 'id' | 'name'>,
>(organizations: readonly T[], query: string): T[] {
  return organizations.filter((org) => organizationMatchesQuery(org, query))
}

/**
 * Current organization first, then A–Z by name (id fallback).
 */
export function sortOrganizationsForSwitcher<
  T extends Pick<OrganizationRecord, 'id' | 'name'>,
>(organizations: readonly T[], currentOrgId: string | null): T[] {
  return [...organizations].sort((left, right) => {
    if (left.id === currentOrgId) {
      return -1
    }
    if (right.id === currentOrgId) {
      return 1
    }
    return organizationLabel(left).localeCompare(organizationLabel(right))
  })
}

export function visibleOrganizations<
  T extends Pick<OrganizationRecord, 'id' | 'name'>,
>(
  organizations: readonly T[],
  query: string,
  currentOrgId: string | null,
): T[] {
  return sortOrganizationsForSwitcher(
    filterOrganizations(organizations, query),
    currentOrgId,
  )
}

/** The list counts as long once it has more organizations than this. */
export function isLongOrgList(organizationCount: number): boolean {
  return organizationCount > ORG_SWITCHER_LONG_LIST_MIN
}

/** Filter field: only for a long list. */
export function shouldShowOrgSwitcherSearch(organizationCount: number): boolean {
  return isLongOrgList(organizationCount)
}

/** "View all organizations": only when the menu list scrolls past what fits. */
export function shouldShowViewAllOrganizations(organizationCount: number): boolean {
  return isLongOrgList(organizationCount)
}
