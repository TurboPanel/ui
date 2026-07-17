import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import {
  applyReencryptSecrets,
  isForbiddenError,
  type ReencryptSecretsResponse,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function SecretsReencryptSection() {
  const { session, handleUnauthorized } = useAuth()
  const isSuperadmin = isSuperadminSession(session)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ReencryptSecretsResponse | null>(null)

  const onReencrypt = async () => {
    setPending(true)
    setError(null)
    setSummary(null)
    try {
      const result = await applyReencryptSecrets()
      setSummary(result)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
      }
      setError(errorMessage(err, 'Failed to re-encrypt secrets'))
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Secrets</Text>
      <Text style={styles.copy}>
        Re-seal at-rest secret envelopes to the current encryption key version
        after a key rotation. Daemon-bound envelopes are left untouched.
      </Text>

      <SectionPanel
        title="At-rest encryption"
        hint="Re-encrypt secret variables, TLS private keys, and principal passwords"
      >
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

        {isSuperadmin ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={pending}
              onPress={() => void onReencrypt()}
              style={[styles.primaryButton, pending ? styles.buttonDisabled : null]}
            >
              <Text style={styles.primaryButtonText}>
                {pending ? 'Re-encrypting…' : 'Re-encrypt secrets'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={orgPanelStyles.muted}>
            Superadmin required to re-encrypt at-rest secrets.
          </Text>
        )}

        {summary ? (
          <View style={styles.summary}>
            <Text style={styles.summaryTitle}>Last sweep</Text>
            <Text style={styles.summaryLine}>Scanned: {summary.scanned}</Text>
            <Text style={styles.summaryLine}>Re-encrypted: {summary.reencrypted}</Text>
            <Text style={styles.summaryLine}>Skipped: {summary.skipped}</Text>
            <Text style={styles.summaryLine}>Failed: {summary.failed}</Text>
          </View>
        ) : null}
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  summary: {
    marginTop: spacing.md,
    gap: 4,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryLine: {
    color: colors.textMuted,
    fontSize: 14,
    fontFamily: 'monospace',
  },
})
