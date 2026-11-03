import { useState } from 'react'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel, SettingRow, Toggle } from '@/components/ui'
import type { HostDefaultsSource, ServerDetailRecord } from '@/lib/instance-api'
import { hideWebServerNamesSourceLabel, sendViaHeaderSourceLabel } from '@/lib/host-defaults'
import { useUpdateServer } from '@/lib/queries/servers'
import { userErrorMessage } from '@/lib/user-error'
import {
  HIDE_WEB_SERVER_NAMES_HINT,
  HIDE_WEB_SERVER_NAMES_LABEL,
  SEND_VIA_HEADER_HINT,
  SEND_VIA_HEADER_LABEL,
} from '@/components/org/server-web-server-settings-section'

type WebServerSwitch = 'hideWebServerNames' | 'sendViaHeader'

/**
 * One server switch: its toggle, where its value comes from, and a way back to
 * the organization setting once this server overrides it.
 */
function ServerSwitchRow({
  label,
  description,
  value,
  source,
  sourceLabel,
  readOnly,
  pending,
  onSave,
}: Readonly<{
  label: string
  description: string
  value: boolean
  source: HostDefaultsSource | null
  sourceLabel: string
  readOnly: boolean
  pending: boolean
  onSave: (value: boolean | null) => void
}>) {
  return (
    <>
      <SettingRow label={label} description={description}>
        <Toggle
          value={value}
          disabled={readOnly || pending}
          accessibilityLabel={`${label} on this server`}
          onValueChange={() => onSave(!value)}
        />
      </SettingRow>
      <Text style={panelStyles.muted}>Source: {sourceLabel}</Text>
      {source === 'server' && !readOnly ? (
        <ButtonRow>
          <Button
            label="Use organization setting"
            accessibilityLabel={`${label}: use organization setting`}
            variant="secondary"
            disabled={pending}
            onPress={() => onSave(null)}
          />
        </ButtonRow>
      ) : null}
    </>
  )
}

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
  const readOnly = !canManage
  const pending = mutation.isPending

  const save = (key: WebServerSwitch, value: boolean | null) => {
    if (readOnly) return
    setError(null)
    mutation.mutate(
      { options: { [key]: value } },
      {
        onError: (err) => {
          setError(userErrorMessage(err, 'Failed to save web server settings'))
        },
      }
    )
  }

  return (
    <SectionPanel
      title="Web server settings"
      hint={`${server.hideWebServerNames ? 'Names hidden' : 'Names shown'} · ${server.sendViaHeader ? 'Via header sent' : 'Via header removed'}`}
      collapsible
      defaultCollapsed
    >
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <ServerSwitchRow
        label={HIDE_WEB_SERVER_NAMES_LABEL}
        description={HIDE_WEB_SERVER_NAMES_HINT}
        value={server.hideWebServerNames}
        source={server.hideWebServerNamesSource}
        sourceLabel={hideWebServerNamesSourceLabel(server.hideWebServerNamesSource)}
        readOnly={readOnly}
        pending={pending}
        onSave={(value) => save('hideWebServerNames', value)}
      />
      <ServerSwitchRow
        label={SEND_VIA_HEADER_LABEL}
        description={SEND_VIA_HEADER_HINT}
        value={server.sendViaHeader}
        source={server.sendViaHeaderSource}
        sourceLabel={sendViaHeaderSourceLabel(server.sendViaHeaderSource)}
        readOnly={readOnly}
        pending={pending}
        onSave={(value) => save('sendViaHeader', value)}
      />
      {readOnly ? <Text style={panelStyles.muted}>Manage permission required.</Text> : null}
    </SectionPanel>
  )
}
