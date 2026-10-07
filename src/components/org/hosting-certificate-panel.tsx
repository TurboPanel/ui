import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Button, ButtonRow } from '@/components/ui'
import {
  describeCertificate,
  dnsResultHeadline,
  dnsSummaryLines,
  type CertificateTone,
} from '@/lib/hosting-certificate'
import type { HostingDnsReport } from '@/lib/instance-api'
import {
  useHostingCertificate,
  useHostingDnsCheck,
  useUseLetsEncrypt,
} from '@/lib/queries/hosting-certificate'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const TONE_COLOR: Record<CertificateTone, string> = {
  neutral: colors.textMuted,
  good: colors.green,
  warning: colors.pending,
  bad: colors.errorText,
  pending: colors.command,
}

const COMPOSE_OWNED_COPY =
  'Compose declares this domain, so its certificate is set there too. Let’s Encrypt cannot be switched on from this screen.'

function DnsResult({ dns }: Readonly<{ dns: HostingDnsReport }>) {
  return (
    <View style={styles.block}>
      <Text style={styles.line}>{dnsResultHeadline(dns)}</Text>
      {dnsSummaryLines(dns).map((line) => (
        <Text key={line} style={styles.hint}>
          {line}
        </Text>
      ))}
    </View>
  )
}

/**
 * The certificate state of one domain, and the one-click "Use Let's Encrypt".
 * Every state word and the choice of actions come from the server's derived
 * `certificate` block; nothing here re-decides them.
 */
export function HostingCertificatePanel({
  orgId,
  hostingId,
  composeOwned,
  disabled,
}: Readonly<{
  orgId: string
  hostingId: string
  composeOwned: boolean
  disabled: boolean
}>) {
  const query = useHostingCertificate(orgId, hostingId)
  const letsEncrypt = useUseLetsEncrypt(orgId, hostingId)
  const dnsCheck = useHostingDnsCheck(hostingId)

  const certificate = query.data?.hosting.certificate ?? null
  if (!certificate) return null

  const view = describeCertificate(certificate)
  const busy = letsEncrypt.isPending
  const requestError = letsEncrypt.error
    ? userErrorMessage(letsEncrypt.error, 'Could not start Let’s Encrypt.')
    : null
  const dnsError = dnsCheck.error
    ? userErrorMessage(dnsCheck.error, 'Could not check DNS.')
    : null
  const dns = dnsCheck.data?.dns ?? null
  const canRequest = view.actions.includes('use_lets_encrypt') && !composeOwned

  const request = () => {
    void letsEncrypt.run()
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Certificate</Text>
      <View style={styles.stateRow}>
        {view.spinner ? <ActivityIndicator size="small" color={colors.command} /> : null}
        <Text style={[styles.state, { color: TONE_COLOR[view.tone] }]}>{view.label}</Text>
      </View>
      {view.lines.map((line) => (
        <Text key={line} style={styles.line}>
          {line}
        </Text>
      ))}
      {view.reason ? <Text style={styles.reason}>{view.reason}</Text> : null}
      {composeOwned ? <Text style={styles.hint}>{COMPOSE_OWNED_COPY}</Text> : null}
      {dns ? <DnsResult dns={dns} /> : null}
      {requestError ? <Text style={styles.reason}>{requestError}</Text> : null}
      {dnsError ? <Text style={styles.reason}>{dnsError}</Text> : null}

      <ButtonRow>
        {canRequest ? (
          <Button
            label="Use Let’s Encrypt"
            busyLabel="Checking DNS…"
            size="sm"
            variant="primary"
            busy={busy}
            disabled={disabled}
            onPress={request}
          />
        ) : null}
        {view.actions.includes('check_dns') ? (
          <Button
            label="Check DNS"
            busyLabel="Checking…"
            size="sm"
            variant="secondary"
            busy={dnsCheck.isPending}
            disabled={disabled}
            onPress={() => void dnsCheck.run()}
          />
        ) : null}
        {view.actions.includes('try_again') && !composeOwned ? (
          <Button
            label="Try again"
            busyLabel="Trying…"
            size="sm"
            variant="secondary"
            busy={busy}
            disabled={disabled}
            onPress={request}
          />
        ) : null}
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.sm },
  title: { color: colors.textMuted, fontSize: 12 },
  stateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  state: { fontSize: 14, fontWeight: '600' },
  line: { color: colors.textBody, fontSize: 12, lineHeight: 17 },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  reason: { color: colors.errorText, fontSize: 12, lineHeight: 17 },
  block: { gap: 2, marginTop: spacing.xs },
})
