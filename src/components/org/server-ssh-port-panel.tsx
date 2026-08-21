import { useState } from 'react'
import { Text } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { Button, ButtonRow, MonoText, TextField } from '@/components/ui'
import type { ServerDetailRecord } from '@/lib/instance-api'
import {
  DEFAULT_SSH_PORT,
  parseSshPortDraft,
  sshPortSourceLabel,
} from '@/lib/host-defaults'
import { useUpdateServer } from '@/lib/queries/servers'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function ServerSshPortPanel({
  orgId,
  server,
  canManage,
}: Readonly<{
  orgId: string
  server: ServerDetailRecord
  canManage: boolean
}>) {
  const mutation = useUpdateServer(orgId, server.id)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inherited = server.sshPortSource !== 'server'
  let sshText = draft ?? ''
  if (draft == null && !inherited) {
    sshText = String(server.sshPort)
  }
  const pending = mutation.isPending
  const readOnly = !canManage

  const savePort = (sshPort: number | null) => {
    if (readOnly) return
    setError(null)
    mutation.mutate(
      { options: { sshPort } },
      {
        onSuccess: () => {
          setDraft(null)
        },
        onError: (err) => {
          setError(errorMessage(err, 'Failed to save SSH port'))
        },
      },
    )
  }

  const saveDraft = () => {
    if (sshText.trim().length === 0) {
      savePort(null)
      return
    }
    const parsed = parseSshPortDraft(sshText)
    if (parsed == null) {
      setError('SSH port must be a whole number from 1 to 65535, or empty to inherit.')
      return
    }
    savePort(parsed)
  }

  return (
    <SectionPanel
      title="SSH"
      hint={`Port ${String(server.sshPort)} · ${sshPortSourceLabel(server.sshPortSource)} · desired listen port, not applied to sshd`}
      collapsible
      defaultCollapsed
    >
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
        <MonoText>{String(server.sshPort)}</MonoText>
      </Text>
      <Text style={orgPanelStyles.muted}>
        Source: {sshPortSourceLabel(server.sshPortSource)}
      </Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <TextField
        label="This server"
        value={sshText}
        onChangeText={setDraft}
        editable={!readOnly && !pending}
        keyboardType="number-pad"
        placeholder={String(server.sshPort || DEFAULT_SSH_PORT)}
        accessibilityLabel="Server SSH port override"
        hint={`Empty inherits the datacenter, then organization, then ${String(DEFAULT_SSH_PORT)}.`}
      />

      {readOnly ? (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
      ) : (
        <ButtonRow>
          <Button
            label="Save SSH port"
            variant="primary"
            busy={pending}
            disabled={pending}
            onPress={saveDraft}
          />
          {server.sshPortSource === 'server' ? (
            <Button
              label="Use inherited"
              variant="secondary"
              disabled={pending}
              onPress={() => savePort(null)}
            />
          ) : null}
        </ButtonRow>
      )}
    </SectionPanel>
  )
}
