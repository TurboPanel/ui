import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { SettingRow, Toggle } from '@/components/ui'
import type { ManagedUserPatch, ManagedUserPatchResult } from '@/lib/instance-api'
import type { ManagedUserRecord } from '@/lib/managed-services'
import { managedErrorMessage } from '@/lib/managed-services'

import { panelStyles } from '@/components/ui/panel-styles'
import { chrome, colors, spacing, webPointer } from '@/lib/theme'

/** Which switch is off, as the one muted line next to the chip. */
export function allDatabasesOffReason(
  off: 'organization' | 'cluster' | null | undefined
): string | null {
  if (off === 'organization') return 'All Databases is switched off for this organization.'
  if (off === 'cluster') return 'All Databases is switched off for this Database Cluster.'
  return null
}

/** The switch that is off, the organization's first; nothing when both allow it or an older control plane says nothing. */
export function allDatabasesOffSwitch(
  switches: { organization: boolean; cluster: boolean } | undefined
): 'organization' | 'cluster' | null {
  if (!switches) return null
  if (!switches.organization) return 'organization'
  return switches.cluster ? null : 'cluster'
}

/** The first database choice of a login: every database, including ones added later. */
export function AllDatabasesChip({
  selected,
  onToggle,
  disabled,
  offReason = null,
}: Readonly<{
  selected: boolean
  onToggle: () => void
  disabled: boolean
  /** The switch that is off, in one sentence; the chip is then disabled and shows it. */
  offReason?: string | null
}>) {
  const blocked = disabled || offReason !== null
  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.chip, selected && styles.chipSelected, webPointer]}
        onPress={onToggle}
        disabled={blocked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled: blocked }}
        aria-checked={selected}
        accessibilityLabel="All Databases"
      >
        <View style={styles.inner}>
          <Text style={[styles.text, selected && styles.textSelected]}>{selected ? '✓' : '+'}</Text>
          <Text style={[styles.text, selected && styles.textSelected]}>All Databases</Text>
        </View>
      </Pressable>
      {offReason ? <Text style={panelStyles.muted}>{offReason}</Text> : null}
      {selected && !offReason ? (
        <Text style={panelStyles.muted}>
          Reads every database on this Database Cluster, including ones added later.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, alignItems: 'flex-start' },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipSelected: { borderColor: chrome.accent, backgroundColor: chrome.bgActive },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  textSelected: { color: colors.link },
})

/** Switches an existing login between All Databases and its picked databases. */
export function LoginAllDatabasesEditor({
  user,
  disabled,
  off,
  onUpdate,
  onError,
}: Readonly<{
  user: ManagedUserRecord
  disabled: boolean
  /** Which switch is off; a login that already has All Databases can still be switched back. */
  off: 'organization' | 'cluster' | null
  onUpdate: (loginId: string, body: ManagedUserPatch) => Promise<ManagedUserPatchResult>
  onError: (message: string | null) => void
}>) {
  const [busy, setBusy] = useState(false)
  const on = user.allDatabases === true
  const reason = on ? null : allDatabasesOffReason(off)
  return (
    <>
      <SettingRow
        label="All Databases"
        description="Reads every database, including ones added later."
      >
        <Toggle
          value={on}
          disabled={disabled || busy || reason !== null}
          busy={busy}
          accessibilityLabel={`All Databases: ${user.username}`}
          onValueChange={(next) => {
            setBusy(true)
            onError(null)
            onUpdate(user.id, { allDatabases: next })
              .catch((err: unknown) =>
                onError(managedErrorMessage(err, 'Failed to change the databases'))
              )
              .finally(() => setBusy(false))
          }}
        />
      </SettingRow>
      {reason ? <Text style={panelStyles.muted}>{reason}</Text> : null}
    </>
  )
}
