import { useState } from 'react'
import { Text } from 'react-native'
import { ConfirmButton, SectionPanel } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  COLOCATED_REPAIR_HELP,
  COLOCATED_REPAIR_PROMPT,
  colocatedRepairResultMessage,
} from '@/lib/colocated-repair'
import { useRepairColocatedConnection } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'

/**
 * Owner-only Repair Connection for the server this control plane runs on,
 * shown where Re-Enroll Token is hidden. The control plane re-issues the
 * credentials of this same server and writes them for its daemon; step-up
 * rides `fetchWithStepUp`, and a cancelled prompt shows nothing.
 */
export function ServerColocatedRepairPanel({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const repair = useRepairColocatedConnection(orgId, serverId)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!canOwn) return null

  const onConfirm = async () => {
    setError(null)
    setMessage(null)
    const result = await repair.run(undefined)
    if (result.ok) setMessage(colocatedRepairResultMessage(result.value))
    else if (result.error !== null) setError(result.error || 'Failed to repair the connection')
  }

  return (
    <SectionPanel title="Repair Connection" hint="This server only">
      <Text style={panelStyles.muted}>{COLOCATED_REPAIR_HELP}</Text>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {message ? <Text style={panelStyles.muted}>{message}</Text> : null}
      <ConfirmButton
        label={repair.isPending ? 'Repairing…' : 'Repair Connection'}
        confirmLabel="Confirm Repair"
        prompt={COLOCATED_REPAIR_PROMPT}
        busy={repair.isPending}
        onConfirm={() => void onConfirm()}
      />
    </SectionPanel>
  )
}
