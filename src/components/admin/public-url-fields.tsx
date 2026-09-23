import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, FormField, SegmentedControl, TextField } from '@/components/ui'
import {
  parsePublicUrlEntry,
  PUBLIC_URL_DEFAULT_PORT,
  PUBLIC_URL_ENTRY_HINT,
  type PublicUrlDraft,
  type PublicUrlScheme,
} from '@/lib/public-url-entry'
import {
  publicUrlsApplyFeedback,
  type PublicUrlsApplyStatus,
} from '@/lib/public-urls-apply'
import { colors, spacing } from '@/lib/theme'

const SCHEME_OPTIONS = [
  { value: 'https', label: 'https' },
  { value: 'http', label: 'http' },
] as const satisfies readonly { value: PublicUrlScheme; label: string }[]

/**
 * Scheme, host, and port as three controls rather than one URL box: the stored
 * value has exactly these parts, so asking for them separately removes every
 * way to type something the control plane would reject. A whole address pasted
 * into the hostname box is still absorbed — `buildPublicUrlEntry` takes its
 * scheme and port and drops the path.
 */
export function AddPublicUrlRow({
  entry,
  entryError,
  busy,
  onEntryChange,
  onAddUrl,
}: Readonly<{
  entry: PublicUrlDraft
  entryError: string | null
  busy: boolean
  onEntryChange: (entry: PublicUrlDraft) => void
  onAddUrl: () => void
}>) {
  return (
    <View style={styles.addBlock}>
      <View style={styles.addRow}>
        <FormField label="Scheme">
          <SegmentedControl
            options={SCHEME_OPTIONS}
            value={entry.scheme}
            onChange={(scheme) => onEntryChange({ ...entry, scheme })}
            disabled={busy}
            accessibilityLabel="Address scheme"
          />
        </FormField>
        <View style={styles.hostField}>
          <TextField
            label="Hostname"
            value={entry.host}
            onChangeText={(host) => onEntryChange({ ...entry, host })}
            placeholder="panel.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onAddUrl}
          />
        </View>
        <View style={styles.portField}>
          <TextField
            label="Port"
            value={entry.port}
            onChangeText={(port) => onEntryChange({ ...entry, port })}
            placeholder="8443"
            inputMode="numeric"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            onSubmitEditing={onAddUrl}
          />
        </View>
        <Button label="Add" onPress={onAddUrl} disabled={busy} />
      </View>
      <Text style={entryError ? styles.addError : styles.addHint}>
        {entryError ?? PUBLIC_URL_ENTRY_HINT}
      </Text>
    </View>
  )
}

/**
 * A stored entry read back as its parts. An entry that will not parse — a
 * hand-edited `TURBOPANEL_PUBLIC_URLS` value, say — is shown verbatim rather
 * than hidden, so the operator can see what to remove. `fill` lets the parts
 * take the leftover width of a row that also has actions.
 */
export function PublicUrlParts({
  url,
  fill = false,
}: Readonly<{ url: string; fill?: boolean }>) {
  const parts = parsePublicUrlEntry(url)
  const textStyle = fill ? [styles.urlText, styles.fill] : styles.urlText
  if (!parts) {
    return (
      <Text selectable style={textStyle}>
        {url}
      </Text>
    )
  }

  const port = parts.port ?? PUBLIC_URL_DEFAULT_PORT[parts.scheme]
  return (
    <View
      style={fill ? [styles.parts, styles.fill] : styles.parts}
      accessibilityLabel={url}
    >
      <Badge label={parts.scheme} tone={parts.scheme === 'https' ? 'ok' : 'pending'} />
      <Text selectable style={styles.hostText}>
        {parts.host}
      </Text>
      <Text style={[styles.portBox, !parts.port && styles.portImplied]}>
        {parts.port ? port : `${port} (default)`}
      </Text>
    </View>
  )
}

export function PublicUrlsApplyFeedback({
  applyStatus,
  applyError,
}: Readonly<{
  applyStatus: PublicUrlsApplyStatus
  applyError: string | null
}>) {
  const feedback = publicUrlsApplyFeedback(applyStatus, applyError)
  if (!feedback) return null
  return <Text style={toneStyles[feedback.tone]}>{feedback.message}</Text>
}

const styles = StyleSheet.create({
  parts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  fill: {
    flex: 1,
  },
  urlText: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
  hostText: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
    flexShrink: 1,
  },
  portBox: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 12,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  portImplied: {
    color: colors.textFaint,
  },
  addBlock: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hostField: {
    flex: 1,
    minWidth: 180,
  },
  portField: {
    width: 96,
  },
  addHint: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  addError: {
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 16,
  },
})

const toneStyles = StyleSheet.create({
  pending: {
    color: colors.pending,
    fontSize: 13,
    fontWeight: '600',
  },
  done: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  failed: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
})
