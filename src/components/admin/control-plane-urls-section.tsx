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

export function ControlPlaneUrlsSection() {
  const { handleUnauthorized } = useAuth()
  const [urls, setUrls] = useState<string[]>([])
  const [draft, setDraft] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyStatus, setApplyStatus] = useState<'idle' | 'done' | 'failed'>('idle')
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
        if (!cancelled) {
          setUrls(result.urls)
          setDraft(result.urls)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            setError(
              err instanceof Error ? err.message : 'Access to public URLs was denied',
            )
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load public URLs')
          }
        }
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

  const onAddUrl = () => {
    const trimmed = newUrl.trim()
    if (!trimmed) {
      return
    }
    setDraft((current) => [...current, trimmed])
    setNewUrl('')
    setError(null)
    setApplyStatus('idle')
    setApplyError(null)
  }

  const onRemoveUrl = (index: number) => {
    setDraft((current) => current.filter((_, i) => i !== index))
    setApplyStatus('idle')
    setApplyError(null)
  }

  const onSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await savePublicUrls(draft)
      setUrls(result.urls)
      setDraft(result.urls)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        setError(err instanceof Error ? err.message : 'Access to public URLs was denied')
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save public URLs')
      }
    } finally {
      setSaving(false)
    }
  }

  const onSaveAndApply = async () => {
    setApplying(true)
    setError(null)
    setApplyStatus('idle')
    setApplyError(null)
    try {
      const result = await applyPublicUrls(draft)
      if (result.ok && result.applied) {
        setUrls(draft)
        setApplyStatus('done')
      } else {
        setApplyStatus('failed')
        setApplyError(result.error ?? 'Apply failed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply public URLs'
      if (message.includes(WORKERS_APPLY_MESSAGE)) {
        setApplyNotAvailable(true)
        setApplyStatus('idle')
        setApplyError(null)
      } else if (isForbiddenError(err)) {
        await handleUnauthorized()
        setApplyStatus('failed')
        setApplyError(message)
      } else {
        setApplyStatus('failed')
        setApplyError(message)
      }
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
          <>
            <View style={styles.list}>
              {draft.length === 0 ? (
                <Text style={orgPanelStyles.muted}>No public URLs configured.</Text>
              ) : (
                draft.map((url, index) => (
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
                ))
              )}
            </View>

            <View style={styles.addRow}>
              <TextInput
                value={newUrl}
                onChangeText={setNewUrl}
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
                onPress={() => void onSave()}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>

              {!applyNotAvailable ? (
                <Pressable
                  style={[styles.primaryButton, applying && styles.buttonDisabled]}
                  disabled={applying}
                  onPress={() => void onSaveAndApply()}
                >
                  <Text style={styles.primaryButtonText}>
                    {applying ? 'Saving & Applying...' : 'Save & Apply'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {!applyNotAvailable ? (
              <Text style={orgPanelStyles.muted}>
                Apply regenerates the TLS cert and reloads Caddy.
              </Text>
            ) : (
              <Text style={orgPanelStyles.muted}>
                Cert apply is not available on this runtime (Cloudflare Workers).
                Save URLs here; apply TLS changes on your self-hosted instance.
              </Text>
            )}

            {applying ? (
              <Text style={styles.applyPending}>Applying…</Text>
            ) : null}
            {applyStatus === 'done' ? (
              <Text style={styles.applyDone}>
                Applied — cert regenerated and Caddy reloaded
              </Text>
            ) : null}
            {applyStatus === 'failed' && applyError ? (
              <Text style={styles.applyFailed}>Apply failed: {applyError}</Text>
            ) : null}
          </>
        )}
      </SectionPanel>
    </View>
  )
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
