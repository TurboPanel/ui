import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel } from '@/components/ui'
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
  pairs: readonly { key: string; value: string }[] | undefined,
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
        <Button
          label="Remove"
          variant="secondary"
          disabled={disabled}
          onPress={onRemove}
          accessibilityLabel={`Remove label ${row.key || 'row'}`}
        />
      ) : null}
    </View>
  )
}

function LabelsReadOnlyList({
  pairs,
}: Readonly<{ pairs: readonly { key: string; value: string }[] }>) {
  if (pairs.length === 0) {
    return <Text style={panelStyles.muted}>No labels.</Text>
  }
  const sorted = [...pairs].sort((a, b) => a.key.localeCompare(b.key))
  return (
    <View style={styles.readList}>
      {sorted.map((pair) => (
        <Text key={pair.key} style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>{pair.key}: </Text>
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
  labels: readonly { key: string; value: string }[] | undefined
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

  const savedCount = labels?.length ?? 0
  let countSummary: string
  if (savedCount === 0) {
    countSummary = 'No labels'
  } else if (savedCount === 1) {
    countSummary = '1 label'
  } else {
    countSummary = `${String(savedCount)} labels`
  }

  return (
    <SectionPanel
      title="Labels"
      hint={`${countSummary} · Replace-all · Docker engine-label keys`}
      collapsible
      defaultCollapsed
    >
      <Text style={panelStyles.muted}>
        Keys must start with a letter or digit, then letters, digits, dots,
        underscores, or hyphens. At most {String(MAX_SERVER_LABELS)} labels;
        keys and values up to 255 characters. Used for placement constraints.
      </Text>

      {displayError ? (
        <Text style={panelStyles.error}>{displayError}</Text>
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
          <ButtonRow>
            <Button
              label="Add label"
              variant="secondary"
              disabled={addDisabled}
              onPress={() => setRows((current) => [...current, createLabelRow()])}
            />
            <Button
              label="Save"
              variant="primary"
              busy={pending}
              disabled={!dirty || pending || !parsed.ok}
              onPress={handleSave}
              accessibilityLabel="Save labels"
            />
          </ButtonRow>
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
  readList: {
    gap: spacing.xs,
  },
})
