import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchOrgServerCapacity,
  isForbiddenError,
  saveOrgServerCapacity,
  type OrgServerCapacity,
} from '@/lib/instance-api'
import { useCan, useForbiddenRecovery } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function formatCapacitySummary(capacity: OrgServerCapacity): string {
  if (capacity.maxServers === null) {
    return `${capacity.usedSeats} in use · unlimited`
  }
  const available = capacity.availableSeats ?? 0
  return `${capacity.usedSeats} of ${capacity.maxServers} in use · ${available} available`
}

export function ServerCapacitySettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [error, setError] = useState<string | null>(null)
  const [draftText, setDraftText] = useState<string | null>(null)
  const [unlimited, setUnlimited] = useState<boolean | null>(null)

  const query = useQuery({
    queryKey: ['org', orgId, 'server-capacity'],
    queryFn: () => fetchOrgServerCapacity(orgId),
    enabled: canManage,
  })
  useForbiddenRecovery(query.error)

  const mutation = useMutation({
    mutationFn: (maxServers: number | null) =>
      saveOrgServerCapacity(orgId, maxServers),
    onSuccess: (data) => {
      setError(null)
      setDraftText(null)
      setUnlimited(null)
      queryClient.setQueryData(['org', orgId, 'server-capacity'], data)
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setError(errorMessage(err, 'Failed to save server capacity'))
    },
  })

  const capacity = query.data
  const isUnlimited = unlimited ?? capacity?.maxServers === null
  let draftValue = draftText ?? ''
  if (draftText === null && capacity && capacity.maxServers !== null) {
    draftValue = String(capacity.maxServers)
  }
  const pending = mutation.isPending || query.isLoading
  const readOnly = !canOwn

  const saveCapacity = () => {
    if (!capacity || readOnly) return
    if (isUnlimited) {
      mutation.mutate(null)
      return
    }
    const parsed = Number.parseInt(draftValue.trim(), 10)
    if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== draftValue.trim()) {
      setError('Enter a whole number ≥ 0, or choose Unlimited.')
      return
    }
    mutation.mutate(parsed)
  }

  if (!canManage) return null

  return (
    <SectionPanel
      title="Server capacity"
      hint="Owner-gated · enrolled servers + pending keys count as seats"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(query.error, 'Failed to load capacity')}
        </Text>
      ) : null}

      {capacity ? (
        <Text style={orgPanelStyles.muted}>{formatCapacitySummary(capacity)}</Text>
      ) : null}

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchLabel}>Unlimited servers</Text>
          <Text style={orgPanelStyles.muted}>
            Self-hosted default. Turn off to set a hard seat cap for this
            organization.
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{
            checked: isUnlimited,
            disabled: readOnly || pending || !capacity,
          }}
          disabled={readOnly || pending || !capacity}
          onPress={() => {
            const next = !isUnlimited
            setUnlimited(next)
            if (next) setDraftText('')
            else if (capacity?.maxServers == null) setDraftText('1')
          }}
          style={[
            styles.toggle,
            isUnlimited ? styles.toggleOn : styles.toggleOff,
            (readOnly || pending) && styles.toggleDisabled,
          ]}
        >
          <Text style={styles.toggleText}>{isUnlimited ? 'On' : 'Off'}</Text>
        </Pressable>
      </View>

      {!isUnlimited ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Max servers</Text>
          <TextInput
            value={draftValue}
            onChangeText={(text) => {
              setDraftText(text)
              setUnlimited(false)
            }}
            editable={!readOnly && !pending}
            keyboardType="number-pad"
            placeholder="e.g. 10"
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              (readOnly || pending) && styles.inputDisabled,
            ]}
          />
        </View>
      ) : null}

      {readOnly ? (
        <Text style={orgPanelStyles.muted}>
          Organization owner permission is required to change the seat cap.
        </Text>
      ) : (
        <Pressable
          disabled={pending || !capacity}
          onPress={saveCapacity}
          style={({ pressed }) => [
            orgPanelStyles.toolbarBtnPrimary,
            pending && styles.toggleDisabled,
            pressed && styles.btnPressed,
            webPointer,
          ]}
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save capacity</Text>
        </Pressable>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  switchLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  toggle: {
    minWidth: 52,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleOn: {
    backgroundColor: chrome.accent,
  },
  toggleOff: {
    backgroundColor: colors.border,
  },
  toggleDisabled: {
    opacity: 0.5,
  },
  toggleText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
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
  },
  inputDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
})
