import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useSaveServerLabels } from '@/lib/queries/servers'
import {
  MAX_SERVER_LABELS,
  parseServerLabelRows,
  pairsToLabelRecord,
  serverLabelsEqual,
  type ServerLabelDraftRow,
} from '@/lib/server-labels'
import { colors, spacing } from '@/lib/theme'

let labelRowSeq = 0

function createLabelRow(key = '', value = ''): ServerLabelDraftRow {
  labelRowSeq += 1
  return { id: `label-${String(labelRowSeq)}`, key, value }
}

function rowsFromPairs(
  pairs: ReadonlyArray<{ key: string; value: string }> | undefined,
): ServerLabelDraftRow[] {
  const rows = [...(pairs ?? [])]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((pair) => createLabelRow(pair.key, pair.value))
  if (rows.length === 0) return [createLabelRow()]
  return rows
}

function LabelDraftRow({
  row,
  disabled,
  onChange,
  onRemove,
  canRemove,
}: Readonly<{
  row: ServerLabelDraftRow
  disabled: boolean
  onChange: (next: ServerLabelDraftRow) => void
  onRemove: () => void
  canRemove: boolean
}>) {
  return (
    <View style={styles.row}>
      <TextInput
        value={row.key}
        onChangeText={(key) => onChange({ ...row, key })}
        placeholder="key"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        accessibilityLabel="Label key"
        style={styles.input}
      />
      <TextInput
        value={row.value}
        onChangeText={(value) => onChange({ ...row, value })}
        placeholder="value"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        accessibilityLabel="Label value"
        style={styles.input}
      />
      {canRemove ? (
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove label ${row.key || 'row'}`}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Remove</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function LabelsReadOnlyList({
  pairs,
}: Readonly<{ pairs: ReadonlyArray<{ key: string; value: string }> }>) {
  if (pairs.length === 0) {
    return <Text style={orgPanelStyles.muted}>No labels.</Text>
  }
  const sorted = [...pairs].sort((a, b) => a.key.localeCompare(b.key))
  return (
    <View style={styles.readList}>
      {sorted.map((pair) => (
        <Text key={pair.key} style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>{pair.key}: </Text>
          {pair.value || '—'}
        </Text>
      ))}
    </View>
  )
}

export function ServerLabelsEditor({
  orgId,
  serverId,
  labels,
  canManage,
}: Readonly<{
  orgId: string
  serverId: string
  labels: ReadonlyArray<{ key: string; value: string }> | undefined
  canManage: boolean
}>) {
  const saved = useMemo(() => pairsToLabelRecord(labels), [labels])
  const [rows, setRows] = useState(() => rowsFromPairs(labels))
  const [error, setError] = useState<string | null>(null)
  const saveMutation = useSaveServerLabels(orgId, serverId)

  useEffect(() => {
    setRows((current) => {
      const parsedRows = parseServerLabelRows(current)
      if (parsedRows.ok && !serverLabelsEqual(parsedRows.labels, saved)) {
        return current
      }
      return rowsFromPairs(
        Object.entries(saved).map(([key, value]) => ({ key, value })),
      )
    })
    setError(null)
  }, [saved])

  const parsed = parseServerLabelRows(rows)
  const dirty =
    parsed.ok && !serverLabelsEqual(parsed.labels, saved)
  const pending = saveMutation.isPending
  const addDisabled = pending || rows.length >= MAX_SERVER_LABELS
  const validationError = parsed.ok ? null : parsed.error
  const displayError = error ?? saveMutation.actionError ?? validationError

  function updateRow(index: number, next: ServerLabelDraftRow) {
    setRows((current) => current.map((row, i) => (i === index ? next : row)))
  }

  function removeRow(index: number) {
    setRows((current) => {
      const next = current.filter((_, i) => i !== index)
      return next.length > 0 ? next : [createLabelRow()]
    })
  }

  function handleSave() {
    const result = parseServerLabelRows(rows)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    saveMutation.mutate(result.labels)
  }

  return (
    <SectionPanel
      title="Labels"
      hint="Replace-all · Docker engine-label keys"
    >
      <Text style={orgPanelStyles.muted}>
        Keys must start with a letter or digit, then letters, digits, dots,
        underscores, or hyphens. At most {String(MAX_SERVER_LABELS)} labels;
        keys and values up to 255 characters. Used for placement constraints.
      </Text>

      {displayError ? (
        <Text style={orgPanelStyles.error}>{displayError}</Text>
      ) : null}

      {!canManage ? <LabelsReadOnlyList pairs={labels ?? []} /> : null}

      {canManage ? (
        <>
          {rows.map((row, index) => (
            <LabelDraftRow
              key={row.id}
              row={row}
              disabled={pending}
              onChange={(next) => updateRow(index, next)}
              onRemove={() => removeRow(index)}
              canRemove={rows.length > 1 || row.key.length > 0 || row.value.length > 0}
            />
          ))}
          <View style={styles.actions}>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                addDisabled && styles.disabled,
                webPointer,
              ]}
              disabled={addDisabled}
              onPress={() => setRows((current) => [...current, createLabelRow()])}
              accessibilityRole="button"
              accessibilityLabel="Add label"
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Add label</Text>
            </Pressable>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnPrimary,
                (!dirty || pending || !parsed.ok) && styles.disabled,
                webPointer,
              ]}
              disabled={!dirty || pending || !parsed.ok}
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel="Save labels"
            >
              {pending ? (
                <ActivityIndicator size="small" color={colors.textMuted} />
              ) : (
                <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Save</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 120,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 14,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  readList: {
    gap: spacing.xs,
  },
  disabled: {
    opacity: 0.5,
  },
})
