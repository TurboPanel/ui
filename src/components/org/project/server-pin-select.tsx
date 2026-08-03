import { createElement, type CSSProperties } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type { OrgServerRecord } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function serverLabel(server: OrgServerRecord): string {
  return (
    server.displayName?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

function serverOptionLabel(server: OrgServerRecord): string {
  const base = serverLabel(server)
  return server.connected ? base : `${base} (offline)`
}

function placementDropdownOptions(
  sortedServers: OrgServerRecord[],
  placementServerId: string | null,
): OrgServerRecord[] {
  const connected = sortedServers.filter((server) => server.connected)
  if (!placementServerId) {
    return connected
  }
  const selected = sortedServers.find((server) => server.id === placementServerId)
  if (!selected || selected.connected) {
    return connected
  }
  return [selected, ...connected]
}

const webSelectStyle: CSSProperties = {
  minWidth: 160,
  maxWidth: 240,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.borderChip,
  borderRadius: 6,
  backgroundColor: colors.bgSecondary,
  color: colors.text,
  fontFamily: 'monospace',
  fontSize: 12,
  padding: '6px 8px',
  minHeight: 32,
}

/**
 * Compact server pin control for Overview (Base default or env override).
 * Optional — empty selection is allowed when `allowClear` is true.
 */
export function ServerPinSelect({
  label,
  hint,
  placementServerId,
  servers,
  saving,
  disabled,
  allowClear,
  onSelect,
  onClear,
}: Readonly<{
  label: string
  hint?: string
  placementServerId: string | null
  servers: OrgServerRecord[]
  saving: boolean
  disabled?: boolean
  allowClear?: boolean
  onSelect: (serverId: string) => void
  onClear?: () => void
}>) {
  const sorted = [...servers].sort((a, b) =>
    serverOptionLabel(a).localeCompare(serverOptionLabel(b)),
  )
  const options = placementDropdownOptions(sorted, placementServerId)
  const busy = saving || Boolean(disabled)

  let picker
  if (options.length === 0) {
    picker = (
      <Text style={styles.empty}>No connected servers</Text>
    )
  } else if (Platform.OS === 'web') {
    picker = createElement(
      'select',
      {
        value: placementServerId ?? '',
        disabled: busy,
        onChange: (event: { target: { value: string } }) => {
          if (event.target.value) onSelect(event.target.value)
        },
        style: webSelectStyle,
        'aria-label': label,
      },
      [
        createElement(
          'option',
          { key: '', value: '', disabled: !allowClear },
          allowClear && !placementServerId ? 'Optional…' : 'Select server…',
        ),
        ...options.map((server) =>
          createElement(
            'option',
            { key: server.id, value: server.id },
            serverOptionLabel(server),
          ),
        ),
      ],
    )
  } else {
    picker = (
      <View style={styles.nativeList}>
        {options.map((server) => {
          const isSelected = placementServerId === server.id
          const canSelect = server.connected
          return (
            <Pressable
              key={server.id}
              disabled={busy || !canSelect}
              style={[
                styles.nativeOption,
                isSelected && styles.nativeOptionSelected,
                (!canSelect || busy) && styles.buttonDisabled,
                webPointer,
              ]}
              onPress={() => onSelect(server.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={serverOptionLabel(server)}
            >
              <Text
                style={[
                  styles.nativeOptionText,
                  isSelected && styles.nativeOptionTextSelected,
                ]}
                numberOfLines={1}
              >
                {serverOptionLabel(server)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {picker}
        {allowClear && placementServerId && onClear ? (
          <Pressable
            style={[styles.clearBtn, busy && styles.buttonDisabled, webPointer]}
            disabled={busy}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear server pin"
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={orgPanelStyles.muted}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
    minWidth: 180,
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  clearBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  nativeList: {
    gap: 4,
  },
  nativeOption: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  nativeOptionSelected: {
    borderColor: colors.green,
    backgroundColor: colors.bgActive,
  },
  nativeOptionText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
  nativeOptionTextSelected: {
    color: colors.green,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
})
