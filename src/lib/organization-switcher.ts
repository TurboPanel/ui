import type { OrganizationRecord } from '@/lib/instance-api'

/** Show the header-menu search field once the operator has this many orgs. */
export const ORG_SWITCHER_HEADER_SEARCH_MIN = 2

export function organizationLabel(
  org: Pick<OrganizationRecord, 'id' | 'displayName'>,
): string {
  return org.displayName?.trim() || org.id
}

export function organizationMatchesQuery(
  org: Pick<OrganizationRecord, 'id' | 'displayName'>,
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
  T extends Pick<OrganizationRecord, 'id' | 'displayName'>,
>(organizations: readonly T[], query: string): T[] {
  return organizations.filter((org) => organizationMatchesQuery(org, query))
}

/**
 * Current organization first, then A–Z by display name (id fallback).
 */
export function sortOrganizationsForSwitcher<
  T extends Pick<OrganizationRecord, 'id' | 'displayName'>,
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
  T extends Pick<OrganizationRecord, 'id' | 'displayName'>,
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

export function shouldShowOrgSwitcherSearch(
  organizationCount: number,
  force: boolean,
): boolean {
  if (force) {
    return organizationCount > 0
  }
  return organizationCount >= ORG_SWITCHER_HEADER_SEARCH_MIN
}
