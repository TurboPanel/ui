import { useRouter, type Href } from 'expo-router'
import {
  COMPOSE_AUTOMATIC_CERTIFICATE_NOTE,
  COMPOSE_OWNED_CERTIFICATE_NOTE,
} from '@/lib/hosting-plain-words'
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
  type CertificateView,
  type LetsEncryptRefusal,
} from '@/lib/hosting-certificate'
import type { HostingDnsReport } from '@/lib/instance-api'
import {
  useHostingCertificate,
  useHostingDnsCheck,
  useUseLetsEncrypt,
} from '@/lib/queries/hosting-certificate'
import { isComposeAutomaticTlsHosting } from '@/lib/hosting-compose-owner'
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

/** The note under a compose-owned domain's certificate state; none for a panel domain. */
function composeNote(composeOwned: boolean, composeAutomatic: boolean): string | null {
  if (!composeOwned) return null
  return composeAutomatic ? COMPOSE_AUTOMATIC_CERTIFICATE_NOTE : COMPOSE_OWNED_CERTIFICATE_NOTE
}

/** What the screen around the certificate panels can do for them. */
export type HostingCertificateActions = Readonly<{
  /** Opens the deploy confirm for this environment; absent where deploying is not offered. */
  onDeploy?: () => void
  deployDisabled?: boolean
  /** Why the latest Let's Encrypt request was refused (from a save or this panel), by hosting id. */
  refusals?: Readonly<Record<string, LetsEncryptRefusal>>
  /** Records how the panel's own request ended, so the newest answer replaces the last one. */
  onRefusal?: (hostingId: string, refusal: LetsEncryptRefusal | null) => void
}>

export const HostingCertificateActionsContext = createContext<HostingCertificateActions>({})

/**
 * The environment header's Deploy, for the certificate that starts on the next
 * deploy. Null outside an environment page or when the person cannot deploy.
 */
export function environmentDeployShortcut(
  model: ReturnType<typeof useOptionalEnvironmentLifecycle>
): DeployShortcut | null {
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

type DeployShortcut = Readonly<{ onDeploy: () => void; disabled: boolean }>

/**
 * What the screen adds to one panel: a Deploy now (the environment page's own
 * Deploy when there is one, else the screen's) and the refusal to show. A
 * screen that keeps refusals holds the newest answer (a save or this panel's
 * own request); without one, the panel's own request error is shown.
 */
function useScreenCertificateActions(
  hostingId: string,
  requestError: unknown
): {
  deploy: DeployShortcut | null
  refusal: LetsEncryptRefusal | null
  onRefusal: HostingCertificateActions['onRefusal']
} {
  const actions = useContext(HostingCertificateActionsContext)
  const pageDeploy = environmentDeployShortcut(useOptionalEnvironmentLifecycle())
  const screenDeploy = actions.onDeploy
    ? { onDeploy: actions.onDeploy, disabled: actions.deployDisabled === true }
    : null
  const ownRefusal = requestError ? letsEncryptRefusal(requestError) : null
  const refusal = actions.refusals ? (actions.refusals[hostingId] ?? null) : ownRefusal
  return { deploy: pageDeploy ?? screenDeploy, refusal, onRefusal: actions.onRefusal }
}

/** Hand the panel's own request result to the screen, so it replaces an older refusal. */
function reportRequest(
  result: Readonly<{ ok: boolean; cause?: unknown }>,
  hostingId: string,
  onRefusal: HostingCertificateActions['onRefusal']
) {
  onRefusal?.(hostingId, result.ok ? null : letsEncryptRefusal(result.cause))
}

function DeployNowButton({
  deploy,
  disabled,
}: Readonly<{ deploy: DeployShortcut; disabled: boolean }>) {
  return (
    <Button
      label="Deploy now"
      size="sm"
      variant="primary"
      disabled={disabled || deploy.disabled}
      accessibilityLabel="Deploy this environment to get the certificate"
      onPress={deploy.onDeploy}
    />
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

/** The actions the server offers for this certificate, plus Deploy now when one is due. */
function CertificateButtons({
  view,
  composeOwned,
  composeAutomatic,
  disabled,
  deploy,
  requesting,
  onRequest,
  checkingDns,
  onCheckDns,
}: Readonly<{
  view: CertificateView
  composeOwned: boolean
  /** Compose asks for Let's Encrypt on this domain, so Try again may re-run the request. */
  composeAutomatic: boolean
  disabled: boolean
  deploy: DeployShortcut | null
  requesting: boolean
  onRequest: () => void
  checkingDns: boolean
  onCheckDns: () => void
}>) {
  const canRequest = view.actions.includes('use_lets_encrypt') && !composeOwned
  return (
    <ButtonRow>
      {view.actions.includes('deploy') && deploy ? (
        <DeployNowButton deploy={deploy} disabled={disabled} />
      ) : null}
      {canRequest ? (
        <Button
          label="Use Let’s Encrypt"
          busyLabel="Checking DNS…"
          size="sm"
          variant="primary"
          busy={requesting}
          disabled={disabled}
          onPress={onRequest}
        />
      ) : null}
      {view.actions.includes('check_dns') ? (
        <Button
          label="Check DNS"
          busyLabel="Checking…"
          size="sm"
          variant="secondary"
          busy={checkingDns}
          disabled={disabled}
          onPress={onCheckDns}
        />
      ) : null}
      {view.actions.includes('try_again') && (!composeOwned || composeAutomatic) ? (
        <Button
          label="Try again"
          busyLabel="Trying…"
          size="sm"
          variant="secondary"
          busy={requesting}
          disabled={disabled}
          onPress={onRequest}
        />
      ) : null}
    </ButtonRow>
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
  const { deploy, refusal, onRefusal } = useScreenCertificateActions(hostingId, letsEncrypt.error)
  const certificate = query.data?.hosting.certificate ?? null
  const composeAutomatic = isComposeAutomaticTlsHosting(query.data?.hosting.metadata)
  const note = composeNote(composeOwned, composeAutomatic)
  if (!certificate) {
    return refusal ? <RefusalNote orgId={orgId} refusal={refusal} /> : null
  }

  const view = describeCertificate(certificate)
  const dnsError = dnsCheck.error
    ? userErrorMessage(dnsCheck.error, 'Could not check DNS.')
    : null
  const dns = dnsCheck.data?.dns ?? null
  const request = () => {
    void letsEncrypt.run().then((result) => reportRequest(result, hostingId, onRefusal))
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
      {note ? <Text style={styles.hint}>{note}</Text> : null}
      {dns ? <DnsResult dns={dns} /> : null}
      {refusal ? <RefusalNote orgId={orgId} refusal={refusal} /> : null}
      {dnsError ? <Text style={styles.reason}>{dnsError}</Text> : null}

      <CertificateButtons
        view={view}
        composeOwned={composeOwned}
        composeAutomatic={composeAutomatic}
        disabled={disabled}
        deploy={deploy}
        requesting={letsEncrypt.isPending}
        onRequest={request}
        checkingDns={dnsCheck.isPending}
        onCheckDns={() => void dnsCheck.run()}
      />
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
