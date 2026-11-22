import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { terminalSwitchOn } from '@/lib/terminal/gate'
import { useSetServerTerminal } from '@/lib/queries/terminal'
import { userErrorMessage } from '@/lib/user-error'

export const TERMINAL_LABEL = 'Container Terminal'
export const TERMINAL_HINT =
  'Allows browser terminals into this server’s containers. Turning it off ends open terminals.'

/** The per-server Container Terminal switch. Off unless a manager turns it on. */
export function ServerTerminalPanel({
  orgId,
  server,
  canManage,
}: Readonly<{ orgId: string; server: ServerDetailRecord; canManage: boolean }>) {
  const mutation = useSetServerTerminal(orgId, server.id)
  const [error, setError] = useState<string | null>(null)
  const enabled = terminalSwitchOn(server.options)

  const save = () => {
    if (!canManage) return
    setError(null)
    mutation.mutate(!enabled, {
      onError: (err) => setError(userErrorMessage(err, 'Failed to save terminal settings')),
    })
  }

  return (
    <SectionPanel
      title="Container Terminal"
      hint={enabled ? 'Terminals allowed' : 'Terminals not allowed'}
      collapsible
      defaultCollapsed
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <SettingRow label={TERMINAL_LABEL} description={canManage ? TERMINAL_HINT : undefined}>
        <Toggle
          value={enabled}
          disabled={!canManage || mutation.isPending}
          accessibilityLabel={`${TERMINAL_LABEL} on this server`}
          onValueChange={save}
        />
      </SettingRow>
      {canManage ? null : <Text style={panelStyles.muted}>Manage permission required.</Text>}
    </SectionPanel>
  )
}
