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
import { useAuth } from '@/lib/auth-context'
import {
  applyPublicUrls,
  fetchPublicUrls,
  isForbiddenError,
  savePublicUrls,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

const WORKERS_APPLY_MESSAGE = 'cert apply is not applicable on this runtime'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

async function recoverIfForbidden(
  err: unknown,
  handleUnauthorized: () => Promise<void>,
): Promise<boolean> {
  if (!isForbiddenError(err)) {
    return false
  }
  await handleUnauthorized()
  return true
}

type ApplyStatus = 'idle' | 'done' | 'failed'

export function ControlPlaneUrlsSection() {
  const { handleUnauthorized } = useAuth()
  const [draft, setDraft] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyStatus, setApplyStatus] = useState<ApplyStatus>('idle')
  const [applyError, setApplyError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [applyNotAvailable, setApplyNotAvailable] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchPublicUrls()
        if (cancelled) {
          return
        }
        setDraft(result.urls)
      } catch (err) {
        if (cancelled) {
          return
        }
        const forbidden = await recoverIfForbidden(err, handleUnauthorized)
        setError(
          errorMessage(
            err,
            forbidden
              ? 'Access to public URLs was denied'
              : 'Failed to load public URLs',
          ),
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [handleUnauthorized])

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

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await savePublicUrls(draft)
      setDraft(result.urls)
    } catch (err) {
      const forbidden = await recoverIfForbidden(err, handleUnauthorized)
      setError(
        errorMessage(
          err,
          forbidden
            ? 'Access to public URLs was denied'
            : 'Failed to save public URLs',
        ),
      )
    } finally {
      setSaving(false)
    }
  }

  const handleApplyError = async (err: unknown) => {
    const message = errorMessage(err, 'Failed to apply public URLs')
    if (message.includes(WORKERS_APPLY_MESSAGE)) {
      setApplyNotAvailable(true)
      clearApplyFeedback()
      return
    }
    await recoverIfForbidden(err, handleUnauthorized)
    setApplyStatus('failed')
    setApplyError(message)
  }

  const onSaveAndApply = async () => {
    setApplying(true)
    setError(null)
    clearApplyFeedback()
    try {
      const result = await applyPublicUrls(draft)
      if (result.ok && result.applied) {
        setApplyStatus('done')
        return
      }
      setApplyStatus('failed')
      setApplyError(result.error ?? 'Apply failed')
    } catch (err) {
      await handleApplyError(err)
    } finally {
      setApplying(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Networking</Text>
      <Text style={styles.copy}>
        Configure the public addresses this control plane is reachable at.
        These URLs drive TLS certificate SANs for daemon connections.
      </Text>

      <SectionPanel
        title="Public URLs"
        hint="Addresses this control plane is reachable at (used for TLS cert SANs)"
      >
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading ? (
          <Text style={orgPanelStyles.muted}>Loading...</Text>
        ) : (
          <PublicUrlsEditor
            draft={draft}
            newUrl={newUrl}
            saving={saving}
            applying={applying}
            applyStatus={applyStatus}
            applyError={applyError}
            applyNotAvailable={applyNotAvailable}
            onNewUrlChange={setNewUrl}
            onAddUrl={onAddUrl}
            onRemoveUrl={onRemoveUrl}
            onSave={() => void onSave()}
            onSaveAndApply={() => void onSaveAndApply()}
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
      <Text style={orgPanelStyles.muted}>
        Cert apply is not available on High Availability control planes.
        Save URLs here; apply TLS changes on your self-hosted instance.
      </Text>
    )
  }

  return (
    <Text style={orgPanelStyles.muted}>
      Apply regenerates the TLS cert and reloads Caddy.
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
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
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
