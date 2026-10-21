import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { hideWebServerNamesSourceLabel } from '@/lib/host-defaults'
import { useUpdateServer } from '@/lib/queries/servers'
import { userErrorMessage } from '@/lib/user-error'
import {
  HIDE_WEB_SERVER_NAMES_HINT,
  HIDE_WEB_SERVER_NAMES_LABEL,
} from '@/components/org/server-web-server-settings-section'

/** Per-server web server settings: follow the organization default, or override it. */
export function ServerWebServerPanel({
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
  const overridden = server.hideWebServerNamesSource === 'server'
  const readOnly = !canManage
  const pending = mutation.isPending

  const save = (hideWebServerNames: boolean | null) => {
    if (readOnly) return
    setError(null)
    mutation.mutate(
      { options: { hideWebServerNames } },
      {
        onError: (err) => {
          setError(userErrorMessage(err, 'Failed to save web server settings'))
        },
      },
    )
  }

  return (
    <SectionPanel
      title="Web server settings"
      hint={`${server.hideWebServerNames ? 'Names hidden' : 'Names shown'} · ${hideWebServerNamesSourceLabel(server.hideWebServerNamesSource)}`}
      collapsible
      defaultCollapsed
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <SettingRow
        label={HIDE_WEB_SERVER_NAMES_LABEL}
        description={HIDE_WEB_SERVER_NAMES_HINT}
      >
        <Toggle
          value={server.hideWebServerNames}
          disabled={readOnly || pending}
          accessibilityLabel={`${HIDE_WEB_SERVER_NAMES_LABEL} on this server`}
          onValueChange={() => save(!server.hideWebServerNames)}
        />
      </SettingRow>
      <Text style={panelStyles.muted}>
        Source: {hideWebServerNamesSourceLabel(server.hideWebServerNamesSource)}
      </Text>
      {readOnly ? (
        <Text style={panelStyles.muted}>Manage permission required.</Text>
      ) : null}
      {overridden && !readOnly ? (
        <ButtonRow>
          <Button
            label="Use organization setting"
            variant="secondary"
            disabled={pending}
            onPress={() => save(null)}
          />
        </ButtonRow>
      ) : null}
    </SectionPanel>
  )
}
