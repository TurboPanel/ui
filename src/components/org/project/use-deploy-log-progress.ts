import { useEffect, useMemo, useState } from 'react'
import type { CommandProgress } from '@/lib/instance-api'
import { useCommandRecordsBatch, type TrackedCommandEntry } from '@/lib/queries/commands'

export type DeployLogRef = Readonly<{ serverId: string; commandId: string }>

type HeldPlan = Readonly<{ commandId: string; progress: CommandProgress }>

/**
 * The step plan shown above the transcript, kept alive past the end of the
 * deploy. The batched poll drops a command the moment it is terminal, so the
 * last plan it carried is held per command id, and once the command is
 * terminal the full record is read once (`GET …/commands/:id` carries the
 * finalised plan) so the end state stays on screen until the log is closed.
 *
 * `polled` is the plan from the batched status poll for `openLog.commandId`,
 * or null when the poll has none. The held plan clears when the log closes
 * or moves to another command.
 */
export function useDeployLogProgress(
  orgId: string,
  openLog: DeployLogRef | null,
  polled: CommandProgress | null,
  terminal: boolean,
): CommandProgress | null {
  const commandId = openLog?.commandId ?? null
  const serverId = openLog?.serverId ?? null
  const [held, setHeld] = useState<HeldPlan | null>(null)
  const finalEntries = useMemo<readonly TrackedCommandEntry[]>(
    () => (commandId && serverId && terminal ? [{ serverId, commandId }] : []),
    [commandId, serverId, terminal],
  )
  const finalRecord = useCommandRecordsBatch(orgId, finalEntries, {
    enabled: finalEntries.length > 0,
  }).data?.[0]
  const finalised = finalRecord?.id === commandId ? (finalRecord.progress ?? null) : null
  const latest = polled ?? finalised

  useEffect(() => {
    setHeld((current) => {
      if (!commandId) return null
      if (latest) {
        return current?.commandId === commandId && current.progress === latest
          ? current
          : { commandId, progress: latest }
      }
      return current?.commandId === commandId ? current : null
    })
  }, [commandId, latest])

  if (!commandId) return null
  if (latest) return latest
  return held?.commandId === commandId ? held.progress : null
}
