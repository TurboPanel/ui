import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  useApplyPublicUrls,
  usePublicUrls,
  useSavePublicUrls,
} from '@/lib/queries/admin'
import { HA_CERT_APPLY_NOTE } from '@/lib/platform-copy'
import { chrome, colors, spacing } from '@/lib/theme'

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
      <Text style={styles.heading}>Networking</Text>
      <Text style={styles.copy}>
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
          <Text style={orgPanelStyles.muted}>Loading...</Text>
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
        <TextInput
          value={newUrl}
          onChangeText={onNewUrlChange}
          placeholder="https://panel.example.com:8443"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={onAddUrl}
        />
        <Pressable style={styles.secondaryButton} onPress={onAddUrl}>
          <Text style={styles.secondaryButtonText}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          disabled={saving}
          onPress={onSave}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving...' : 'Save'}
          </Text>
        </Pressable>

        {!applyNotAvailable ? (
          <Pressable
            style={[styles.primaryButton, applying && styles.buttonDisabled]}
            disabled={applying}
            onPress={onSaveAndApply}
          >
            <Text style={styles.primaryButtonText}>
              {applying ? 'Saving & Applying...' : 'Save & Apply'}
            </Text>
          </Pressable>
        ) : null}
      </View>

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
        <Text style={orgPanelStyles.muted}>No public URLs configured.</Text>
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
          <Pressable
            style={styles.removeButton}
            onPress={() => onRemoveUrl(index)}
          >
            <Text style={styles.removeButtonText}>Remove</Text>
          </Pressable>
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
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
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
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: colors.textChip,
    fontSize: 14,
    fontWeight: '700',
  },
  removeButton: {
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
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
