import type { DeletePlan } from '@/lib/instance-api'
import { principalUsageLines } from '@/lib/principal-words'
import { apiErrorCopy, CONTROL_PLANE_UNREACHABLE_COPY, isNetworkFetchError } from '@/lib/user-error'

/**
 * Words for deleting a project or an environment in one step: what the
 * confirmation lists (grouped by server) and why a delete cannot run yet.
 * Never a raw `HTTP 409: …`.
 */

type PlanFolder = DeletePlan['folders'][number]

export type DeletePlanServerGroup = Readonly<{
  serverId: string
  serverName: string
  connected: boolean
  remove: readonly PlanFolder[]
  keep: readonly PlanFolder[]
}>

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** The folders of a plan, one group per server, servers in the plan's order. */
export function groupFoldersByServer(plan: DeletePlan): DeletePlanServerGroup[] {
  const groups = new Map<string, { remove: PlanFolder[]; keep: PlanFolder[] }>()
  for (const entry of plan.folders) {
    const group = groups.get(entry.serverId) ?? { remove: [], keep: [] }
    group[entry.action].push(entry)
    groups.set(entry.serverId, group)
  }
  const servers = new Map(plan.servers.map((row) => [row.id, row]))
  const order = [
    ...plan.servers.map((row) => row.id).filter((id) => groups.has(id)),
    ...[...groups.keys()].filter((id) => !servers.has(id)),
  ]
  return order.map((serverId) => {
    const server = servers.get(serverId)
    const group = groups.get(serverId) ?? { remove: [], keep: [] }
    return {
      serverId,
      serverName: server?.name?.trim() || 'Unnamed server',
      connected: server?.connected ?? false,
      remove: group.remove,
      keep: group.keep,
    }
  })
}

/** How a folder reads in the list: its path, else its service or volume name. */
export function folderLabel(entry: PlanFolder): string {
  if (entry.path) return entry.path
  const kind = entry.kind === 'volume' ? 'Volume' : 'Service'
  return entry.assetName ? `${kind} ${entry.assetName}` : `${kind} folder`
}

/** Why a Hosting Account stays, in plain words. */
export function hostingAccountKeepReason(
  usedBy: DeletePlan['hostingAccounts'][number]['usedBy']
): string {
  const lines = principalUsageLines(usedBy ?? {})
  return lines.length > 0
    ? `Kept: still used outside this project (${lines.join(', ')}).`
    : 'Kept: still used outside this project.'
}

type PlanCertificate = NonNullable<DeletePlan['certificates']>[number]

/** The Let's Encrypt certificates a delete removes or keeps, in the plan's order. */
export function planCertificates(plan: DeletePlan): readonly PlanCertificate[] {
  return plan.certificates ?? []
}

/** How a certificate reads in the list: its names, then what happens to it. */
export function certificateLine(entry: PlanCertificate): string {
  const names = entry.names.length > 0 ? entry.names.join(', ') : 'Unnamed certificate'
  if (entry.action === 'remove') return `${names}: removed, no other site uses it.`
  const others = entry.otherSites ?? 0
  if (others > 0) {
    return `${names}: kept, ${plural(others, 'other site uses', 'other sites use')} it.`
  }
  return `${names}: kept, another site uses it.`
}

/** One sentence for a short confirmation, e.g. the environment delete prompt. */
export function deletePlanSummary(plan: DeletePlan, subject: string): string {
  const removed = plan.folders.filter((row) => row.action === 'remove')
  const kept = plan.folders.filter((row) => row.action === 'keep')
  const parts = [
    plural(plan.services.length, 'service', 'services'),
    plural(removed.length, 'folder', 'folders'),
  ]
  const accounts = plan.hostingAccounts.filter((row) => row.action === 'remove')
  if (accounts.length > 0)
    parts.push(plural(accounts.length, 'Hosting Account', 'Hosting Accounts'))
  const certificates = planCertificates(plan).filter((row) => row.action === 'remove')
  if (certificates.length > 0) {
    parts.push(
      plural(certificates.length, "Let's Encrypt certificate", "Let's Encrypt certificates")
    )
  }
  const servers = groupFoldersByServer(plan)
    .filter((group) => group.remove.length > 0)
    .map((group) => group.serverName)
  const where = servers.length > 0 ? ` on ${servers.join(', ')}` : ''
  return `Delete ${subject}? This removes ${parts.join(', ')}${where}.${keptVolumesSentence(kept.length)}`
}

/** The sentence about volumes that keep their data, with a leading space; empty for none. */
function keptVolumesSentence(count: number): string {
  if (count === 0) return ''
  if (count === 1) return ' 1 volume is set to keep its data and stays.'
  return ` ${count} volumes are set to keep their data and stay.`
}

/** The plan's reasons the delete cannot run yet, one sentence each. */
export function deletePlanBlockerLines(plan: DeletePlan | undefined): string[] {
  return (plan?.blockers ?? []).map(
    (blocker) => blocker.message.trim() || apiErrorCopy(new Error(blocker.error)) || blocker.error
  )
}

const CODE_CHARS = /^[a-z0-9_]+$/

/**
 * The panel's own words after `HTTP <status>: <code> — `, or null. Read with
 * plain string steps: the status line, then the code, then the dash.
 */
function serverExplanation(message: string): string | null {
  const status = message.indexOf('HTTP ')
  if (status < 0) return null
  const colon = message.indexOf(':', status)
  const dash = message.indexOf(' — ', colon)
  if (colon < 0 || dash < 0) return null
  const code = message.slice(colon + 1, dash).trim()
  if (!CODE_CHARS.test(code)) return null
  const text = message.slice(dash + 3).trim()
  return text === '' ? null : text
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return ''
}

/**
 * A failed delete as one sentence a person can act on. The panel's own words
 * (sent beside the code) win, then the fixed copy for the code, then
 * `fallback`; the raw status line is never shown.
 */
export function deleteFailureMessage(err: unknown, fallback: string): string {
  if (isNetworkFetchError(err)) return CONTROL_PLANE_UNREACHABLE_COPY
  const message = messageOf(err)
  const explained = serverExplanation(message)
  if (explained) return explained
  const mapped = apiErrorCopy(message)
  if (mapped) return mapped
  if (message.trim() === '' || message.includes('HTTP ')) return fallback
  return message.trim()
}
