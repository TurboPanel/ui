import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { useUpdateServer } from '@/lib/queries/servers'
import { userErrorMessage } from '@/lib/user-error'

export const NETWORK_SHARES_LABEL = 'Allow Network Shares'
export const NETWORK_SHARES_HINT = 'Lets compose files mount SMB shares on this server.'

/**
 * The per-server Allow Network Shares switch. Off unless turned on here: there
 * is no organization setting to follow. Deploying a share also needs the
 * Deploy network shares permission.
 */
export function ServerNetworkSharesPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const mutation = useUpdateServer(orgId, server.id)
  const [error, setError] = useState<string | null>(null)
  const enabled = server.networkShares === true

  const save = () => {
    if (!canManage) return
    setError(null)
    mutation.mutate(
      { options: { networkShares: !enabled } },
      {
        onError: (err) => {
          setError(userErrorMessage(err, 'Failed to save network share settings'))
        },
      }
    )
  }

  return (
    <SectionPanel
      title="Network Shares"
      hint={enabled ? 'Shares allowed' : 'Shares not allowed'}
      collapsible
      defaultCollapsed
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <SettingRow label={NETWORK_SHARES_LABEL} description={NETWORK_SHARES_HINT}>
        <Toggle
          value={enabled}
          disabled={!canManage || mutation.isPending}
          accessibilityLabel={`${NETWORK_SHARES_LABEL} on this server`}
          onValueChange={save}
        />
      </SettingRow>
      {canManage ? null : <Text style={panelStyles.muted}>Manage permission required.</Text>}
    </SectionPanel>
  )
}
