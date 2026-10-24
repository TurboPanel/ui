import { useRouter, type Href } from 'expo-router'
import { createContext, useContext } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useOptionalEnvironmentLifecycle } from '@/components/org/project/overview-environments-panel'
import { Button, ButtonRow } from '@/components/ui'
import {
  describeCertificate,
  dnsResultHeadline,
  dnsSummaryLines,
  letsEncryptRefusal,
  type CertificateTone,
  type LetsEncryptRefusal,
} from '@/lib/hosting-certificate'
import type { HostingDnsReport } from '@/lib/instance-api'
import {
  useHostingCertificate,
  useHostingDnsCheck,
  useUseLetsEncrypt,
} from '@/lib/queries/hosting-certificate'
import { orgSettingsTabHref } from '@/lib/org-navigation'
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

/** What the screen around the certificate panels can do for them. */
export type HostingCertificateActions = Readonly<{
  /** Opens the deploy confirm for this environment; absent where deploying is not offered. */
  onDeploy?: () => void
  deployDisabled?: boolean
  /** Why Let's Encrypt was refused when a save asked for it, by hosting id. */
  refusals?: Readonly<Record<string, LetsEncryptRefusal>>
}>

export const HostingCertificateActionsContext = createContext<HostingCertificateActions>({})

/**
 * The environment header's Deploy, for the certificate that starts on the next
 * deploy. Null outside an environment page or when the person cannot deploy.
 */
export function environmentDeployShortcut(
  model: ReturnType<typeof useOptionalEnvironmentLifecycle>
): { onDeploy: () => void; disabled: boolean } | null {
  if (!model?.canMutateLifecycle) return null
  return {
    onDeploy: () => model.openDeployConfirm(model.hasContainers ? 'redeploy' : 'deploy'),
    disabled: !model.hasServer || model.busy || model.needsPrincipal,
  }
}

const SETTINGS_LINK_LABEL = 'Organization settings \u203a Domains & certificates'

/** A refused Let's Encrypt request in plain words, with the way to fix it when there is one. */
function RefusalNote({ orgId, refusal }: Readonly<{ orgId: string; refusal: LetsEncryptRefusal }>) {
  const router = useRouter()
  return (
    <View style={styles.block}>
      <Text style={styles.reason}>{refusal.message}</Text>
      {refusal.openSettings ? (
        <ButtonRow>
          <Button
            label={SETTINGS_LINK_LABEL}
            size="sm"
            variant="secondary"
            accessibilityLabel={`Open ${SETTINGS_LINK_LABEL}`}
            onPress={() => router.push(orgSettingsTabHref(orgId, 'domains') as Href)}
          />
        </ButtonRow>
      ) : null}
    </View>
  )
}

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
  const actions = useContext(HostingCertificateActionsContext)
  // The environment page's own Deploy (the header's) when there is one, else the screen's.
  const pageDeploy = environmentDeployShortcut(useOptionalEnvironmentLifecycle())
  const deploy =
    pageDeploy ??
    (actions.onDeploy
      ? { onDeploy: actions.onDeploy, disabled: actions.deployDisabled === true }
      : null)

  // The panel's own request is newer than a refusal from the last save.
  const refusal = letsEncrypt.error
    ? letsEncryptRefusal(letsEncrypt.error)
    : (actions.refusals?.[hostingId] ?? null)
  const certificate = query.data?.hosting.certificate ?? null
  if (!certificate) {
    return refusal ? <RefusalNote orgId={orgId} refusal={refusal} /> : null
  }

  const view = describeCertificate(certificate)
  const busy = letsEncrypt.isPending
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
      {refusal ? <RefusalNote orgId={orgId} refusal={refusal} /> : null}
      {dnsError ? <Text style={styles.reason}>{dnsError}</Text> : null}

      <ButtonRow>
        {view.actions.includes('deploy') && deploy ? (
          <Button
            label="Deploy now"
            size="sm"
            variant="primary"
            disabled={disabled || deploy.disabled}
            accessibilityLabel="Deploy this environment to get the certificate"
            onPress={deploy.onDeploy}
          />
        ) : null}
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
