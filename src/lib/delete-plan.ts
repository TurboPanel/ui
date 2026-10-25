import type { DeletePlan } from '@/lib/instance-api'
import { principalUsageLines } from '@/lib/principal-words'
import {
  apiErrorCopy,
  CONTROL_PLANE_UNREACHABLE_COPY,
  isNetworkFetchError,
} from '@/lib/user-error'

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
export function hostingAccountKeepReason(usedBy: DeletePlan['hostingAccounts'][number]['usedBy']): string {
  const lines = principalUsageLines(usedBy ?? {})
  return lines.length > 0
    ? `Kept: still used outside this project (${lines.join(', ')}).`
    : 'Kept: still used outside this project.'
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
  if (accounts.length > 0) parts.push(plural(accounts.length, 'Hosting Account', 'Hosting Accounts'))
  const servers = groupFoldersByServer(plan)
    .filter((group) => group.remove.length > 0)
    .map((group) => group.serverName)
  const where = servers.length > 0 ? ` on ${servers.join(', ')}` : ''
  const keep =
    kept.length > 0
      ? ` ${kept.length === 1 ? '1 volume is set to keep its data and stays' : `${kept.length} volumes are set to keep their data and stay`}.`
      : ''
  return `Delete ${subject}? This removes ${parts.join(', ')}${where}.${keep}`
}

/** The plan's reasons the delete cannot run yet, one sentence each. */
export function deletePlanBlockerLines(plan: DeletePlan | undefined): string[] {
  return (plan?.blockers ?? []).map(
    (blocker) => blocker.message.trim() || apiErrorCopy(new Error(blocker.error)) || blocker.error
  )
}

const SERVER_EXPLANATION = /HTTP \d+:\s*[a-z0-9_]+\s+—\s+([\s\S]+)$/

/**
 * A failed delete as one sentence a person can act on. The panel's own words
 * (sent beside the code) win, then the fixed copy for the code, then
 * `fallback`; the raw status line is never shown.
 */
export function deleteFailureMessage(err: unknown, fallback: string): string {
  if (isNetworkFetchError(err)) return CONTROL_PLANE_UNREACHABLE_COPY
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const explained = SERVER_EXPLANATION.exec(message)?.[1]?.trim()
  if (explained) return explained
  const mapped = apiErrorCopy(message)
  if (mapped) return mapped
  if (message.trim() === '' || /HTTP \d+/.test(message)) return fallback
  return message.trim()
}
