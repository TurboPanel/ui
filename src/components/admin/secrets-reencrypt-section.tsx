import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import type { ReencryptSecretsResponse } from '@/lib/instance-api'
import { useApplyReencryptSecrets } from '@/lib/queries/admin'
import { chrome, colors, spacing } from '@/lib/theme'

export function SecretsReencryptSection() {
  const { session } = useAuth()
  const isSuperadmin = isSuperadminSession(session)
  const reencryptMutation = useApplyReencryptSecrets()
  const [summary, setSummary] = useState<ReencryptSecretsResponse | null>(null)

  const displayError = reencryptMutation.actionError

  const onReencrypt = () => {
    setSummary(null)
    reencryptMutation.mutate(undefined, {
      onSuccess: (result) => {
        setSummary(result)
      },
    })
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
        {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

        {isSuperadmin ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={reencryptMutation.isPending}
              onPress={onReencrypt}
              style={[
                styles.primaryButton,
                reencryptMutation.isPending ? styles.buttonDisabled : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {reencryptMutation.isPending ? 'Re-encrypting…' : 'Re-encrypt secrets'}
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
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: chrome.onAccent,
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
