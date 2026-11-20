import { isForbiddenError, isHttpStatusError } from '@/lib/fetch-error-detail'
import { OrganizationDeleteBlockedError } from '@/lib/instance-api'
import { orgAreaHref, serversTunnelsHref } from '@/lib/org-navigation'
import { userErrorMessage } from '@/lib/user-error'

/** What goes with an organization, and what must go first. Shown above the Delete button. */
export const ORGANIZATION_DELETE_COPY =
  'Deleting an organization permanently removes its projects, environments, access, notification channels, settings and activity history. Servers, tunnels and DNS records are never deleted for you: remove them first. People keep their own accounts.'

/** The dialog sentence: one line, the same everywhere the dialog opens. */
export const ORGANIZATION_DELETE_DIALOG_DESCRIPTION =
  'Permanently deletes this organization with its projects, environments, access and history. This cannot be undone.'

export const ORGANIZATION_DELETE_FORBIDDEN =
  'Only the organization owner or a platform admin can delete an organization.'

export type OrganizationDeleteFailure = Readonly<{
  message: string
  /** The page that fixes it, when there is one. */
  link: Readonly<{ label: string; href: string }> | null
}>

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${String(count)} ${many}`
}

/** Plain words and the page to fix it for one 409 from an organization delete. */
export function organizationDeleteBlock(
  error: OrganizationDeleteBlockedError,
  orgId: string
): OrganizationDeleteFailure {
  switch (error.code) {
    case 'root_organization':
      return {
        message: 'This is the root organization. It belongs to the platform and cannot be deleted.',
        link: null,
      }
    case 'organization_has_servers':
      return {
        message: `This organization still has ${plural(error.count, 'server', 'servers')}. Purge or remove every server first; servers are never moved to another organization.`,
        link: { label: 'Open Servers', href: orgAreaHref(orgId, 'servers') },
      }
    case 'organization_has_tunnels':
      return {
        message: `This organization still has ${plural(error.count, 'tunnel', 'tunnels')}. Remove every tunnel first.`,
        link: { label: 'Open Tunnels', href: serversTunnelsHref(orgId) },
      }
    case 'organization_has_dns_records':
      return {
        message: `This organization still has ${plural(error.count, 'DNS record', 'DNS records')}. Remove them first; they are the hostnames on its tunnels.`,
        link: { label: 'Open Tunnels', href: serversTunnelsHref(orgId) },
      }
  }
}

/** Whatever went wrong with an organization delete, in plain words. */
export function organizationDeleteFailure(err: unknown, orgId: string): OrganizationDeleteFailure {
  if (err instanceof OrganizationDeleteBlockedError) return organizationDeleteBlock(err, orgId)
  if (isForbiddenError(err)) return { message: ORGANIZATION_DELETE_FORBIDDEN, link: null }
  if (isHttpStatusError(err, 404)) {
    return {
      message: 'This organization was not found, or you are not allowed to delete it.',
      link: null,
    }
  }
  return { message: userErrorMessage(err, 'Could not delete the organization.'), link: null }
}

/** Where to land once an organization is deleted: another one the person belongs to, else null (the picker). */
export function nextOrganizationAfterDelete(
  organizations: readonly Readonly<{ id: string }>[],
  deletedId: string
): string | null {
  return organizations.find((org) => org.id !== deletedId)?.id ?? null
}

/** The admin list's Delete button: off for the root organization, and while servers remain (with the reason). */
export function organizationDeleteGate(
  row: Readonly<{ isRoot: boolean; serverCount: number }>
): Readonly<{ disabled: boolean; reason: string | null }> {
  if (row.isRoot) {
    return { disabled: true, reason: 'The root organization cannot be deleted.' }
  }
  if (row.serverCount > 0) {
    return {
      disabled: true,
      reason: `Remove its ${plural(row.serverCount, 'server', 'servers')} first.`,
    }
  }
  return { disabled: false, reason: null }
}
