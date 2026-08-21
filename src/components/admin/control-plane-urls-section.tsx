import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  Button,
  ButtonRow,
  EmptyState,
  LoadingState,
  TextField,
} from '@/components/ui'
import {
  useApplyPublicUrls,
  usePublicUrls,
  useSavePublicUrls,
} from '@/lib/queries/admin'
import { HA_CERT_APPLY_NOTE } from '@/lib/platform-copy'
import { colors, spacing } from '@/lib/theme'

const WORKERS_APPLY_MESSAGE = 'cert apply is not applicable on this runtime'

type ApplyStatus = 'idle' | 'done' | 'failed'

export function ControlPlaneUrlsSection() {
  const publicUrlsQuery = usePublicUrls()
  const saveMutation = useSavePublicUrls()
  const applyMutation = useApplyPublicUrls()

  const [draft, setDraft] = useState<string[]>([])
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
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
    error ?? saveMutation.actionError ?? applyMutation.actionError ?? queryError

  const clearApplyFeedback = () => {
    setApplyStatus('idle')
    setApplyError(null)
  }

  const onAddUrl = () => {
    const trimmed = newUrl.trim()
    if (!trimmed) {
      return
    }
    setDraft((current) => [...current, trimmed])
    setNewUrl('')
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

  const handleApplyError = (message: string) => {
    if (message.includes(WORKERS_APPLY_MESSAGE)) {
      setApplyNotAvailable(true)
      clearApplyFeedback()
      return
    }
    setApplyStatus('failed')
    setApplyError(message)
  }

  const onSaveAndApply = () => {
    setError(null)
    clearApplyFeedback()
    applyMutation.mutate(draft, {
      onSuccess: (result) => {
        if (result.ok && result.applied) {
          setApplyStatus('done')
          return
        }
        setApplyStatus('failed')
        setApplyError(result.error ?? 'Apply failed')
      },
      onError: () => {
        const message = applyMutation.actionError ?? 'Failed to apply public URLs'
        handleApplyError(message)
      },
    })
  }

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Networking</Text>
      <Text style={orgPanelStyles.pageCopy}>
        Configure the public addresses this control plane is reachable at.
        These URLs drive the Platform CA leaf SANs used for daemon → control-plane
        trust (explicitly not the per-organization Organization CA).
      </Text>

      <SectionPanel
        title="Public URLs"
        hint="Addresses this control plane is reachable at (used for TLS cert SANs)"
      >
        {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}
        {publicUrlsQuery.isLoading ? (
          <LoadingState />
        ) : (
          <PublicUrlsEditor
            draft={draft}
            newUrl={newUrl}
            saving={saveMutation.isPending}
            applying={applyMutation.isPending}
            applyStatus={applyStatus}
            applyError={applyError}
            applyNotAvailable={applyNotAvailable}
            onNewUrlChange={setNewUrl}
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
  newUrl,
  saving,
  applying,
  applyStatus,
  applyError,
  applyNotAvailable,
  onNewUrlChange,
  onAddUrl,
  onRemoveUrl,
  onSave,
  onSaveAndApply,
}: Readonly<{
  draft: string[]
  newUrl: string
  saving: boolean
  applying: boolean
  applyStatus: ApplyStatus
  applyError: string | null
  applyNotAvailable: boolean
  onNewUrlChange: (value: string) => void
  onAddUrl: () => void
  onRemoveUrl: (index: number) => void
  onSave: () => void
  onSaveAndApply: () => void
}>) {
  return (
    <>
      <UrlList draft={draft} onRemoveUrl={onRemoveUrl} />

      <View style={styles.addRow}>
        <View style={styles.addField}>
          <TextField
            label="New URL"
            value={newUrl}
            onChangeText={onNewUrlChange}
            placeholder="https://panel.example.com:8443"
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={onAddUrl}
          />
        </View>
        <Button label="Add" onPress={onAddUrl} />
      </View>

      <ButtonRow>
        <Button
          label="Save"
          busyLabel="Saving..."
          variant="primary"
          busy={saving}
          onPress={onSave}
        />
        {!applyNotAvailable ? (
          <Button
            label="Save & Apply"
            busyLabel="Saving & Applying..."
            variant="primary"
            busy={applying}
            onPress={onSaveAndApply}
          />
        ) : null}
      </ButtonRow>

      <ApplyAvailabilityNote applyNotAvailable={applyNotAvailable} />
      <ApplyFeedback
        applying={applying}
        applyStatus={applyStatus}
        applyError={applyError}
      />
    </>
  )
}

function UrlList({
  draft,
  onRemoveUrl,
}: Readonly<{
  draft: string[]
  onRemoveUrl: (index: number) => void
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
          <Text selectable style={styles.urlText}>
            {url}
          </Text>
          <Button
            label="Remove"
            size="sm"
            onPress={() => onRemoveUrl(index)}
          />
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
      <Text style={orgPanelStyles.muted}>{HA_CERT_APPLY_NOTE}</Text>
    )
  }

  return (
    <Text style={orgPanelStyles.muted}>
      Apply regenerates the Platform CA leaf for LAN / :8443 listeners and reloads
      Caddy. Public HTTPS on port 443 (Cloudflare tunnel, Let’s Encrypt, or an
      uploaded certificate) is trusted by clients via the system store. Let’s
      Encrypt is never issued automatically — it stays opt-in.
    </Text>
  )
}

function ApplyFeedback({
  applying,
  applyStatus,
  applyError,
}: Readonly<{
  applying: boolean
  applyStatus: ApplyStatus
  applyError: string | null
}>) {
  if (applying) {
    return <Text style={styles.applyPending}>Applying…</Text>
  }
  if (applyStatus === 'done') {
    return (
      <Text style={styles.applyDone}>
        Applied — cert regenerated and Caddy reloaded
      </Text>
    )
  }
  if (applyStatus === 'failed' && applyError) {
    return <Text style={styles.applyFailed}>Apply failed: {applyError}</Text>
  }
  return null
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
  urlText: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
    flex: 1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addField: {
    flex: 1,
  },
  applyPending: {
    color: colors.pending,
    fontSize: 13,
    fontWeight: '600',
  },
  applyDone: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  applyFailed: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
})
