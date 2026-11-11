import { useState } from 'react'
import { Text, View } from 'react-native'
import { Button, ButtonRow, SegmentedControl, TextField } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { ManagedAdminToolAccess, ManagedAdminToolId } from '@/lib/instance-api'
import {
  ADMIN_ACCESS_OPTIONS,
  ADMIN_TOOL_ACCESS_HINTS,
  ADMIN_TOOL_EXPOSURE_WARNING,
  adminToolBody,
  adminToolChoices,
  hostnameHint,
} from '@/lib/managed-admin-tools'
import { spacing } from '@/lib/theme'

/** The inline form that adds a tool: which tool, its address and its access. */
export function AddAdminToolForm({
  engine,
  serverName,
  busy,
  error,
  onSubmit,
  onCancel,
}: Readonly<{
  engine: string | null
  serverName: string | null
  busy: boolean
  error: string | null
  onSubmit: (body: ReturnType<typeof adminToolBody>) => void
  onCancel: () => void
}>) {
  const choices = adminToolChoices(engine)
  const [tool, setTool] = useState<ManagedAdminToolId | null>(null)
  const [hostname, setHostname] = useState('')
  const [access, setAccess] = useState<ManagedAdminToolAccess>('admin')
  // The first choice of the engine is the default until a chip is pressed.
  const chosen = tool ?? choices[0]?.value ?? null
  const ready = chosen !== null && hostname.trim() !== ''
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={panelStyles.detailLabel}>Tool</Text>
      <SegmentedControl
        options={choices.map(({ value, label }) => ({ value, label }))}
        value={chosen ?? 'adminer'}
        onChange={setTool}
        disabled={busy}
        accessibilityLabel="Admin tool"
      />
      <TextField
        label="Hostname"
        value={hostname}
        onChangeText={setHostname}
        placeholder="db-admin.example.com"
        hint={hostnameHint(serverName ?? undefined)}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
      />
      <Text style={panelStyles.detailLabel}>Access</Text>
      <SegmentedControl
        options={ADMIN_ACCESS_OPTIONS}
        value={access}
        onChange={setAccess}
        disabled={busy}
        accessibilityLabel="Admin tool access"
      />
      <Text style={panelStyles.muted}>{ADMIN_TOOL_ACCESS_HINTS[access]}</Text>
      <View style={panelStyles.calloutWarning}>
        <Text style={panelStyles.calloutWarningText}>{ADMIN_TOOL_EXPOSURE_WARNING}</Text>
      </View>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <ButtonRow>
        <Button
          label="Add and Deploy"
          variant="primary"
          disabled={busy || !ready}
          onPress={() => {
            if (chosen) onSubmit(adminToolBody({ tool: chosen, hostname, access }))
          }}
        />
        <Button label="Cancel" disabled={busy} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}
