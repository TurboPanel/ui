import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { ServerDetailRecord } from '@/lib/instance-api'
import {
  DEFAULT_SSH_PORT,
  parseSshPortDraft,
  sshPortSourceLabel,
} from '@/lib/host-defaults'
import { useUpdateServer } from '@/lib/queries/servers'
import { colors, spacing } from '@/lib/theme'

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
    <SectionPanel title="SSH" hint="Desired listen port · not applied to sshd">
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Effective: </Text>
        <Text style={styles.mono}>{String(server.sshPort)}</Text>
      </Text>
      <Text style={orgPanelStyles.muted}>
        Source: {sshPortSourceLabel(server.sshPortSource)}
      </Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>This server</Text>
        <TextInput
          value={sshText}
          onChangeText={setDraft}
          editable={!readOnly && !pending}
          keyboardType="number-pad"
          placeholder={String(server.sshPort || DEFAULT_SSH_PORT)}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Server SSH port override"
          style={[styles.input, (readOnly || pending) && styles.inputDisabled]}
        />
        <Text style={orgPanelStyles.muted}>
          Empty inherits the datacenter, then organization, then{' '}
          {String(DEFAULT_SSH_PORT)}.
        </Text>
      </View>

      {readOnly ? (
        <Text style={orgPanelStyles.muted}>Manage permission required.</Text>
      ) : (
        <View style={styles.actions}>
          <Pressable
            disabled={pending}
            onPress={saveDraft}
            style={({ pressed }) => [
              orgPanelStyles.toolbarBtnPrimary,
              pending && styles.inputDisabled,
              pressed && styles.btnPressed,
              webPointer,
            ]}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save SSH port</Text>
          </Pressable>
          {server.sshPortSource === 'server' ? (
            <Pressable
              disabled={pending}
              onPress={() => savePort(null)}
              style={({ pressed }) => [
                orgPanelStyles.toolbarBtnSecondary,
                pending && styles.inputDisabled,
                pressed && styles.btnPressed,
                webPointer,
              ]}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                Use inherited
              </Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
