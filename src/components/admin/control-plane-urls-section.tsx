import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  CopyButton,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import {
  type ApplyPublicUrlsOutcome,
  useApplyPublicUrls,
  usePublicUrls,
  useSavePublicUrls,
} from '@/lib/queries/admin'
import { HA_CERT_APPLY_NOTE } from '@/lib/platform-copy'
import {
  addPublicUrlEntry,
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

const WORKERS_APPLY_MESSAGE = 'cert apply is not applicable on this runtime'

const EMPTY_ENTRY: PublicUrlDraft = { scheme: 'https', host: '', port: '' }

const SCHEME_OPTIONS = [
  { value: 'https', label: 'https' },
  { value: 'http', label: 'http' },
] as const satisfies readonly { value: PublicUrlScheme; label: string }[]

const OUTCOME_STATUS: Record<
  ApplyPublicUrlsOutcome['kind'],
  PublicUrlsApplyStatus
> = {
  applied: 'applied',
  reconnected: 'reconnected',
  'not-saved': 'not-saved',
  unreachable: 'unreachable',
}

export function ControlPlaneUrlsSection() {
  const publicUrlsQuery = usePublicUrls()
  const saveMutation = useSavePublicUrls()
  const applyMutation = useApplyPublicUrls()

  const [draft, setDraft] = useState<string[]>([])
  const [applyStatus, setApplyStatus] = useState<PublicUrlsApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [entry, setEntry] = useState<PublicUrlDraft>(EMPTY_ENTRY)
  const [entryError, setEntryError] = useState<string | null>(null)
  const [applyNotAvailable, setApplyNotAvailable] = useState(false)

  useEffect(() => {
    if (publicUrlsQuery.data) {
      setDraft(publicUrlsQuery.data.urls)
    }
  }, [publicUrlsQuery.data])

  let queryError: string | null = null
  if (publicUrlsQuery.isError) {
    queryError =
      publicUrlsQuery.error instanceof Error
        ? publicUrlsQuery.error.message
        : 'Failed to load public URLs'
  }
  const displayError =
    error ?? saveMutation.actionError ?? queryError

  const clearApplyFeedback = () => {
    setApplyStatus('idle')
    setApplyError(null)
  }

  const onAddUrl = () => {
    const result = addPublicUrlEntry(draft, entry)
    if (!result.ok) {
      setEntryError(result.error)
      return
    }
    setDraft(result.urls)
    setEntry({ ...EMPTY_ENTRY, scheme: entry.scheme })
    setEntryError(null)
    setError(null)
    clearApplyFeedback()
  }

  const onRemoveUrl = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index))
    clearApplyFeedback()
  }

  const onSave = () => {
    setError(null)
    saveMutation.mutate(draft, {
      onSuccess: (result) => {
        setDraft(result.urls)
      },
      onError: () => {
        setError(saveMutation.actionError ?? 'Failed to save public URLs')
      },
    })
  }

  /**
   * A failure here is only a failure when the control plane answered. The
   * restart it causes is absorbed by `useApplyPublicUrls`, which reports back
   * as `reconnected` / `unreachable` instead of throwing.
   */
  const handleApplyFailure = (message: string | null) => {
    if (message === null) {
      clearApplyFeedback()
      return
    }
    if (message.includes(WORKERS_APPLY_MESSAGE)) {
      setApplyNotAvailable(true)
      clearApplyFeedback()
      return
    }
    setApplyStatus('failed')
    setApplyError(message)
  }

  const onSaveAndApply = async () => {
    setError(null)
    setApplyError(null)
    setApplyStatus('applying')
    const result = await applyMutation.run({
      urls: draft,
      onReconnecting: () => setApplyStatus('reconnecting'),
    })
    if (!result.ok) {
      handleApplyFailure(result.error)
      return
    }
    const outcome = result.value
    if (outcome.kind === 'reconnected' || outcome.kind === 'not-saved') {
      setDraft(outcome.urls)
    }
    setApplyStatus(OUTCOME_STATUS[outcome.kind])
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Networking</Text>
      <Text style={panelStyles.pageCopy}>
        Every address this control plane answers on. They become the Platform CA
        leaf SANs used for daemon → control-plane trust (explicitly not the
        per-organization Organization CA), the webhook endpoint a Git provider
        delivers to, and the origin baked into generated install commands.
      </Text>

      <SectionPanel
        title="Public URLs"
        hint="Scheme, host, and port — used for TLS certificate SANs, Git webhook callbacks, and install commands"
      >
        {displayError ? <Text style={panelStyles.error}>{displayError}</Text> : null}
        {publicUrlsQuery.isLoading ? (
          <LoadingState />
        ) : (
          <PublicUrlsEditor
            draft={draft}
            entry={entry}
            entryError={entryError}
            saving={saveMutation.isPending}
            applying={applyMutation.isPending}
            applyStatus={applyStatus}
            applyError={applyError}
            applyNotAvailable={applyNotAvailable}
            onEntryChange={setEntry}
            onAddUrl={onAddUrl}
            onRemoveUrl={onRemoveUrl}
            onSave={onSave}
            onSaveAndApply={onSaveAndApply}
          />
        )}
      </SectionPanel>
    </View>
  )
}

function PublicUrlsEditor({
  draft,
  entry,
  entryError,
  saving,
  applying,
  applyStatus,
  applyError,
  applyNotAvailable,
  onEntryChange,
  onAddUrl,
  onRemoveUrl,
  onSave,
  onSaveAndApply,
}: Readonly<{
  draft: string[]
  entry: PublicUrlDraft
  entryError: string | null
  saving: boolean
  applying: boolean
  applyStatus: PublicUrlsApplyStatus
  applyError: string | null
  applyNotAvailable: boolean
  onEntryChange: (entry: PublicUrlDraft) => void
  onAddUrl: () => void
  onRemoveUrl: (index: number) => void
  onSave: () => void
  onSaveAndApply: () => void
}>) {
  const busy = saving || applying
  return (
    <>
      <UrlList draft={draft} onRemoveUrl={onRemoveUrl} busy={busy} />

      <AddUrlRow
        entry={entry}
        entryError={entryError}
        busy={busy}
        onEntryChange={onEntryChange}
        onAddUrl={onAddUrl}
      />

      <ButtonRow>
        <Button
          label="Save"
          busyLabel="Saving…"
          variant="primary"
          busy={saving}
          disabled={applying}
          onPress={onSave}
        />
        {!applyNotAvailable ? (
          <Button
            label="Save & Apply"
            busyLabel={
              applyStatus === 'reconnecting' ? 'Reconnecting…' : 'Saving & Applying…'
            }
            variant="primary"
            busy={applying}
            disabled={saving}
            onPress={onSaveAndApply}
          />
        ) : null}
      </ButtonRow>

      <ApplyAvailabilityNote applyNotAvailable={applyNotAvailable} />
      <ApplyFeedback applyStatus={applyStatus} applyError={applyError} />
    </>
  )
}

/**
 * Scheme, host, and port as three controls rather than one URL box: the stored
 * value has exactly these parts, so asking for them separately removes every
 * way to type something the control plane would reject. A whole address pasted
 * into the hostname box is still absorbed — `buildPublicUrlEntry` takes its
 * scheme and port and drops the path.
 */
function AddUrlRow({
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

function UrlList({
  draft,
  onRemoveUrl,
  busy,
}: Readonly<{
  draft: string[]
  onRemoveUrl: (index: number) => void
  busy: boolean
}>) {
  if (draft.length === 0) {
    return (
      <View style={styles.list}>
        <EmptyState title="No public URLs configured." />
      </View>
    )
  }

  return (
    <View style={styles.list}>
      {draft.map((url, index) => (
        <View key={`${url}-${index}`} style={styles.urlRow}>
          <UrlParts url={url} />
          <View style={styles.urlActions}>
            <CopyButton value={url} />
            <Button
              label="Remove"
              size="sm"
              disabled={busy}
              onPress={() => onRemoveUrl(index)}
            />
          </View>
        </View>
      ))}
    </View>
  )
}

/**
 * A stored entry read back as its parts. An entry that will not parse — a
 * hand-edited `TURBOPANEL_PUBLIC_URLS` value, say — is shown verbatim rather
 * than hidden, so the operator can see what to remove.
 */
function UrlParts({ url }: Readonly<{ url: string }>) {
  const parts = parsePublicUrlEntry(url)
  if (!parts) {
    return (
      <Text selectable style={styles.urlText}>
        {url}
      </Text>
    )
  }

  const port = parts.port ?? PUBLIC_URL_DEFAULT_PORT[parts.scheme]
  return (
    <View style={styles.parts} accessibilityLabel={url}>
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

function ApplyAvailabilityNote({
  applyNotAvailable,
}: Readonly<{ applyNotAvailable: boolean }>) {
  if (applyNotAvailable) {
    return (
      <Text style={panelStyles.muted}>{HA_CERT_APPLY_NOTE}</Text>
    )
  }

  return (
    <Text style={panelStyles.muted}>
      Apply regenerates the Platform CA leaf for LAN / :8443 listeners and reloads
      Caddy. Public HTTPS on port 443 (Cloudflare tunnel, Let’s Encrypt, or an
      uploaded certificate) is trusted by clients via the system store. Let’s
      Encrypt is never issued automatically — it stays opt-in.
    </Text>
  )
}

function ApplyFeedback({
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
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    borderWidth: 1,
    borderColor: colors.borderArea,
  },
  parts: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  urlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  urlText: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
    flex: 1,
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
