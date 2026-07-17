import { useCallback, useEffect, useState } from 'react'
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
  createTlsCertificate,
  deleteTlsCertificate,
  fetchTlsLibrary,
  isForbiddenError,
  type TlsRecord,
  type TlsSource,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function tlsTitle(row: TlsRecord): string {
  return row.displayName?.trim() || row.metadata.dnsNames[0] || row.id
}

function formatSans(row: TlsRecord): string {
  return row.metadata.dnsNames.join(', ') || '—'
}

export function TlsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [rows, setRows] = useState<TlsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<TlsSource>('upload')
  const [displayName, setDisplayName] = useState('')
  const [certificatePem, setCertificatePem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')
  const [hostnames, setHostnames] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchTlsLibrary()
      setRows(result.tls)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to load TLS library')
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    reload().catch(() => {
      // Errors are surfaced via error state inside reload.
    })
  }, [reload])

  const onCreate = () => {
    if (!canManage) return
    setSaving(true)
    setError(null)
    const run = async () => {
      try {
        if (source === 'upload') {
          await createTlsCertificate({
            source: 'upload',
            displayName: displayName.trim() || undefined,
            certificatePem,
            privateKeyPem,
          })
        } else {
          const names = hostnames
            .split(',')
            .map((n) => n.trim())
            .filter((n) => n.length > 0)
          await createTlsCertificate({
            source,
            displayName: displayName.trim() || undefined,
            hostnames: names,
          })
        }
        setCertificatePem('')
        setPrivateKeyPem('')
        setHostnames('')
        setDisplayName('')
        await reload()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to create certificate')
      } finally {
        setSaving(false)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  const onDelete = (id: string) => {
    if (!canManage) return
    setDeletingId(id)
    setError(null)
    const run = async () => {
      try {
        await deleteTlsCertificate(id)
        await reload()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(err instanceof Error ? err.message : 'Failed to delete certificate')
      } finally {
        setDeletingId(null)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  const renderCertificateList = () => {
    if (loading) {
      return <Text style={orgPanelStyles.muted}>Loading…</Text>
    }
    if (rows.length === 0) {
      return <Text style={orgPanelStyles.muted}>No certificates yet.</Text>
    }
    return rows.map((row) => (
      <View key={row.id} style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailTitle}>{tlsTitle(row)}</Text>
        <Text style={orgPanelStyles.muted}>
          {row.source} · {row.metadata.status}
        </Text>
        <Text style={styles.sans}>{formatSans(row)}</Text>
        {row.metadata.notAfter ? (
          <Text style={orgPanelStyles.muted}>
            Expires {new Date(row.metadata.notAfter).toLocaleString()}
          </Text>
        ) : null}
        {canManage ? (
          <Pressable
            style={[
              styles.secondaryButton,
              deletingId === row.id && styles.buttonDisabled,
            ]}
            disabled={deletingId !== null}
            onPress={() => onDelete(row.id)}
          >
            <Text style={styles.secondaryButtonText}>
              {deletingId === row.id ? 'Deleting…' : 'Delete'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    ))
  }

  return (
    <View style={styles.root}>
      <SectionPanel
        title="TLS certificates"
        hint="Organization certificate library — pin explicitly on hosting (default is basic self-signed)"
      >
        {renderCertificateList()}
      </SectionPanel>

      {canManage ? (
        <SectionPanel title="Add certificate" hint="Upload PEM, mint self-signed, or request Let's Encrypt">
          <View style={styles.sourceRow}>
            {(['upload', 'self_signed', 'lets_encrypt'] as const).map((value) => (
              <Pressable
                key={value}
                style={[
                  styles.sourceChip,
                  source === value && styles.sourceChipActive,
                ]}
                onPress={() => setSource(value)}
              >
                <Text
                  style={[
                    styles.sourceChipText,
                    source === value && styles.sourceChipTextActive,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name (optional)"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          {source === 'upload' ? (
            <>
              <TextInput
                value={certificatePem}
                onChangeText={setCertificatePem}
                placeholder="Certificate PEM (leaf + chain)"
                placeholderTextColor={colors.textDim}
                multiline
                style={[styles.input, styles.pemInput]}
              />
              <TextInput
                value={privateKeyPem}
                onChangeText={setPrivateKeyPem}
                placeholder="Private key PEM"
                placeholderTextColor={colors.textDim}
                multiline
                style={[styles.input, styles.pemInput]}
              />
            </>
          ) : (
            <TextInput
              value={hostnames}
              onChangeText={setHostnames}
              placeholder="hostnames, comma-separated"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          )}
          {source === 'lets_encrypt' ? (
            <Text style={orgPanelStyles.muted}>
              Creates a pending ACME order; certificates become usable after issuance.
            </Text>
          ) : null}
          <Pressable
            style={[styles.primaryButton, saving && styles.buttonDisabled]}
            disabled={saving}
            onPress={onCreate}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Saving…' : 'Add certificate'}
            </Text>
          </Pressable>
        </SectionPanel>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  sans: {
    color: colors.text,
    marginTop: spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sourceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sourceChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgSecondary,
  },
  sourceChipText: {
    color: colors.textDim,
    fontSize: 13,
  },
  sourceChipTextActive: {
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pemInput: {
    minHeight: 120,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    color: colors.textChip,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  error: {
    color: colors.error,
  },
})
