import type {
  OrgPrincipalRecord,
  OrgPrincipalState,
  PrincipalRemovalAction,
  PrincipalUsage,
} from '@/lib/instance-api'

/**
 * The one place a principal is defined for people. Everywhere else says
 * "principal" and, where the form matters, "system user" or "database login".
 */
export const PRINCIPAL_DEFINITION =
  'A principal is an account responsible for the contents within it. On a server it is a system user, the Linux account a site runs as. For a database it is a database login.'

export const PRINCIPAL_SERVER_TAB_HINT =
  'Principals placed on this server, each as a system user. The Principals tab of Manage organization lists all of them.'

export const PRINCIPAL_STATE_LABELS: Record<OrgPrincipalState, string> = {
  none: 'Not on a server',
  pending: 'Being set up',
  present: 'On the server',
  retiring: 'Being removed',
  absent: 'Removed',
}

export function principalStateLabel(state: OrgPrincipalState): string {
  return PRINCIPAL_STATE_LABELS[state]
}

export function principalStateTone(state: OrgPrincipalState): 'ok' | 'pending' | 'muted' | 'danger' {
  switch (state) {
    case 'present':
      return 'ok'
    case 'pending':
    case 'retiring':
      return 'pending'
    default:
      return 'muted'
  }
}

export function principalFormLabels(forms: OrgPrincipalRecord['forms']): string {
  const labels = forms.map((form) => (form === 'system' ? 'System user' : 'Database login'))
  return labels.length > 0 ? labels.join(' and ') : 'No form yet'
}

function countLine(count: number, one: string, many: string): string | null {
  if (count <= 0) return null
  return `${count} ${count === 1 ? one : many}`
}

/** Plain-words lines for what still uses a principal; empty when nothing does. */
export function principalUsageLines(usage: Partial<PrincipalUsage>): string[] {
  return [
    countLine(usage.tenancies ?? 0, 'service runs as it', 'services run as it'),
    countLine(usage.bindings ?? 0, 'app is connected to it', 'apps are connected to it'),
    countLine(usage.storages ?? 0, 'storage location is owned by it', 'storage locations are owned by it'),
    countLine(usage.secrets ?? 0, 'secret belongs to it', 'secrets belong to it'),
    countLine(usage.logins ?? 0, 'database login', 'database logins'),
    countLine(usage.otherPlacements ?? 0, 'other server has it', 'other servers have it'),
  ].filter((line): line is string => line !== null)
}

/** Why a principal cannot be deleted from the Principals tab, or null when it can. */
export function principalDeleteBlockedReason(row: OrgPrincipalRecord): string | null {
  if (row.canDelete) return null
  if (row.projectId !== null) {
    return `Belongs to the project ${row.projectName ?? ''}`.trim() + '. Remove it from that project.'
  }
  const lines = principalUsageLines(row.usedBy)
  return lines.length > 0 ? `In use: ${lines.join(', ')}.` : 'In use.'
}

export const REMOVAL_ACTION_LABELS: Record<PrincipalRemovalAction, string> = {
  keep: 'Keep the principal, remove it from this server only',
  delete: 'Delete the principal outright',
}

export const SERVER_REMOVAL_PRINCIPALS_INTRO =
  'These principals have a system user on this server. By default each one is kept in the organization and only taken off this server. Delete one outright only if nothing else uses it.'
