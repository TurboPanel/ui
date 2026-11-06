import type { ColocatedRepairResult } from '@/lib/instance-api'

/** Help line on the Repair Connection panel (co-located server only). */
export const COLOCATED_REPAIR_HELP =
  "Use this when this server's daemon can't connect. It issues new credentials for this same server and restarts the connection."

/** The question the confirm step asks. */
export const COLOCATED_REPAIR_PROMPT =
  "Issue new credentials for this server's daemon? Its old credentials stop working."

/** What to show after a repair: what changed, then what happens next. */
export function colocatedRepairResultMessage(result: ColocatedRepairResult): string {
  const key = result.clearedKey ? ' Its old key was cleared so it can connect again.' : ''
  return `New credentials were written for this server.${key} The daemon reconnects as this same server within a few minutes.`
}
