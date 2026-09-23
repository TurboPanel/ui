import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  AddPublicUrlRow,
  PublicUrlParts,
  PublicUrlsApplyFeedback,
} from '@/components/admin/public-url-fields'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  CopyButton,
  EmptyState,
  LoadingState,
  SectionPanel,
} from '@/components/ui'
import {
  type ApplyPublicUrlsOutcome,
  useApplyPublicUrls,
  usePublicUrls,
  useSavePublicUrls,
} from '@/lib/queries/admin'
import { HA_CERT_APPLY_NOTE } from '@/lib/platform-copy'
import { addPublicUrlEntry, type PublicUrlDraft } from '@/lib/public-url-entry'
import { type PublicUrlsApplyStatus } from '@/lib/public-urls-apply'
import { colors, spacing } from '@/lib/theme'

const WORKERS_APPLY_MESSAGE = 'cert apply is not applicable on this runtime'

const EMPTY_ENTRY: PublicUrlDraft = { scheme: 'https', host: '', port: '' }

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
      onReconnecting: () => setApplyStatus('reconnecting'),
    })
    if (!result.ok) {
      handleApplyFailure(result.error)
      return
    }
    const outcome = result.value
    if (outcome.kind === 'reconnected' || outcome.kind === 'not-saved') {
      setDraft(outcome.hostnames.map((entry) => entry.host))
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

      <AddPublicUrlRow
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
      <PublicUrlsApplyFeedback applyStatus={applyStatus} applyError={applyError} />
    </>
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
          <PublicUrlParts url={url} fill />
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
  urlActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
})
