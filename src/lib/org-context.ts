const STORAGE_KEY = 'turbopanel.lastOrganizationId'

/** Must match instance `src/client/org-context.ts`. */
export const ORG_ID_HEADER = 'X-Turbopanel-Organization-Id'

let activeOrganizationId: string | null = null

export function getStoredOrganizationId(): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  const value = localStorage.getItem(STORAGE_KEY)?.trim()
  return value && value.length > 0 ? value : null
}

export function setStoredOrganizationId(orgId: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(STORAGE_KEY, orgId)
}

export function clearStoredOrganizationId(): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.removeItem(STORAGE_KEY)
}

export function getActiveOrganizationId(): string | null {
  return activeOrganizationId
}

export function setActiveOrganizationId(orgId: string | null): void {
  activeOrganizationId = orgId
  if (orgId) {
    setStoredOrganizationId(orgId)
  } else {
    clearStoredOrganizationId()
  }
}

export function resolvePreferredOrganizationId(
  organizations: { id: string }[],
): string | null {
  if (organizations.length === 0) {
    return null
  }

  const stored = getStoredOrganizationId()
  if (stored && organizations.some((org) => org.id === stored)) {
    return stored
  }

  if (organizations.length === 1) {
    return organizations[0]!.id
  }

  return null
}
