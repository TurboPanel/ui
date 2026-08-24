import { createElement, type CSSProperties, type ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { EmptyState } from '@/components/ui'
import type { OrgServerRecord } from '@/lib/instance-api'
import { serverDisplayName } from '@/lib/resource-labels'
import { colors, spacing } from '@/lib/theme'

function serverOptionLabel(server: OrgServerRecord): string {
  const base = serverDisplayName(server)
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

function compactSelectWidth(muted: boolean): { minWidth: number; maxWidth: number } {
  if (muted) {
    return { minWidth: 220, maxWidth: 280 }
  }
  return { minWidth: 132, maxWidth: 200 }
}

function webSelectStyle(
  compact: boolean,
  muted: boolean,
): CSSProperties {
  const width = compact
    ? compactSelectWidth(muted)
    : { minWidth: 160, maxWidth: 240 }
  return {
    minWidth: width.minWidth,
    maxWidth: width.maxWidth,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    color: muted ? colors.textMuted : colors.text,
    fontFamily: muted ? undefined : 'monospace',
    fontSize: 12,
    fontWeight: muted ? 500 : undefined,
    padding: compact ? '5px 8px' : '6px 8px',
    minHeight: compact ? 28 : 32,
  }
}

function resolveEmptyOptionLabel(
  placeholder: string | undefined,
  allowClear: boolean,
  placementServerId: string | null,
): string {
  if (!placeholder) {
    if (allowClear) {
      return placementServerId ? 'Clear…' : 'Optional…'
    }
    return 'Select server…'
  }
  if (allowClear && placementServerId) {
    return 'Clear…'
  }
  return placeholder
}

function WebServerPinPicker({
  label,
  emptyOptionLabel,
  placementServerId,
  options,
  busy,
  allowClear,
  compact,
  onSelect,
  onClear,
}: Readonly<{
  label: string
  emptyOptionLabel: string
  placementServerId: string | null
  options: OrgServerRecord[]
  busy: boolean
  allowClear: boolean
  compact: boolean
  onSelect: (serverId: string) => void
  onClear?: () => void
}>): ReactNode {
  const emptyMuted = !placementServerId
  return createElement(
    'select',
    {
      value: placementServerId ?? '',
      disabled: busy,
      onChange: (event: { target: { value: string } }) => {
        const next = event.target.value
        if (next) {
          onSelect(next)
          return
        }
        if (allowClear && onClear) onClear()
      },
      style: webSelectStyle(compact, emptyMuted),
      title: label,
      'aria-label': label,
    },
    [
      createElement(
        'option',
        { key: '', value: '' },
        emptyOptionLabel,
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
}

function NativeServerPinPicker({
  placementServerId,
  options,
  busy,
  allowClear,
  onSelect,
  onClear,
}: Readonly<{
  placementServerId: string | null
  options: OrgServerRecord[]
  busy: boolean
  allowClear: boolean
  onSelect: (serverId: string) => void
  onClear?: () => void
}>): ReactNode {
  return (
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
      {allowClear && placementServerId && onClear ? (
        <Pressable
          style={[styles.nativeOption, busy && styles.buttonDisabled, webPointer]}
          disabled={busy}
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear server pin"
        >
          <Text style={styles.nativeOptionText}>Clear…</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function renderServerPinPicker(params: Readonly<{
  label: string
  emptyOptionLabel: string
  placementServerId: string | null
  options: OrgServerRecord[]
  busy: boolean
  allowClear: boolean
  compact: boolean
  onSelect: (serverId: string) => void
  onClear?: () => void
}>): ReactNode {
  if (params.options.length === 0) {
    return <EmptyState title="No connected servers" />
  }
  if (Platform.OS === 'web') {
    return (
      <WebServerPinPicker
        label={params.label}
        emptyOptionLabel={params.emptyOptionLabel}
        placementServerId={params.placementServerId}
        options={params.options}
        busy={params.busy}
        allowClear={params.allowClear}
        compact={params.compact}
        onSelect={params.onSelect}
        onClear={params.onClear}
      />
    )
  }
  return (
    <NativeServerPinPicker
      placementServerId={params.placementServerId}
      options={params.options}
      busy={params.busy}
      allowClear={params.allowClear}
      onSelect={params.onSelect}
      onClear={params.onClear}
    />
  )
}

/**
 * Compact server pin control for Overview (project server or env override).
 * Optional — empty selection is allowed when `allowClear` is true.
 * `compact` lays out for a header-friendly footprint; `hideLabel` drops the
 * visible label (aria-label still uses `label`).
 */
export function ServerPinSelect({
  label,
  hint,
  placeholder,
  placementServerId,
  servers,
  saving,
  disabled,
  allowClear,
  compact,
  hideLabel,
  onSelect,
  onClear,
}: Readonly<{
  label: string
  hint?: string
  /** Empty-option copy (e.g. "+ Project server"). */
  placeholder?: string
  placementServerId: string | null
  servers: OrgServerRecord[]
  saving: boolean
  disabled?: boolean
  allowClear?: boolean
  compact?: boolean
  hideLabel?: boolean
  onSelect: (serverId: string) => void
  onClear?: () => void
}>) {
  const sorted = [...servers].sort((a, b) =>
    serverOptionLabel(a).localeCompare(serverOptionLabel(b)),
  )
  const options = placementDropdownOptions(sorted, placementServerId)
  const busy = saving || Boolean(disabled)
  const canClear = Boolean(allowClear)
  const isCompact = Boolean(compact)
  const emptyOptionLabel = resolveEmptyOptionLabel(
    placeholder,
    canClear,
    placementServerId,
  )
  const showClearButton = canClear && Boolean(placementServerId) && Boolean(onClear) && !isCompact

  return (
    <View style={[styles.root, isCompact && styles.rootCompact]}>
      {hideLabel ? null : (
        <Text style={[styles.label, isCompact && styles.labelCompact]}>{label}</Text>
      )}
      <View style={styles.row}>
        {renderServerPinPicker({
          label,
          emptyOptionLabel,
          placementServerId,
          options,
          busy,
          allowClear: canClear,
          compact: isCompact,
          onSelect,
          onClear,
        })}
        {showClearButton ? (
          <Pressable
            style={[styles.clearBtn, busy && styles.buttonDisabled, webPointer]}
            disabled={busy}
            hitSlop={{ top: 6, bottom: 6 }}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear server pin"
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {hint && !isCompact ? (
        <Text style={orgPanelStyles.muted}>{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: 4,
    minWidth: 180,
  },
  rootCompact: {
    minWidth: 0,
    maxWidth: 280,
    gap: 0,
    alignItems: 'flex-end',
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  labelCompact: {
    fontSize: 10,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
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
    borderRadius: 8,
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
