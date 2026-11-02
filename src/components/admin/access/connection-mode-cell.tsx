import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CheckList } from '@/components/admin/access/check-list'
import { Badge, Button, ConfirmButton, Select, TextLink } from '@/components/ui'
import {
  APPLY_CAUSE_TEXT,
  capabilityFor,
  connectionModeOptions,
  INGRESS_PHASE_PRESENTATION,
  portForModeChange,
} from '@/lib/connection-modes'
import type {
  EdgeGate,
  HostnameIngressPatch,
  IngressAccountRecord,
  IngressApplyResult,
  IngressCapabilities,
  IngressCheck,
  IngressMode,
  InstanceHostnameRecord,
} from '@/lib/instance-api'
import { isControlPlaneRestartError } from '@/lib/control-plane-recovery'
import {
  useApplyHostnameIngress,
  useHostnameIngressStatus,
  usePreflightHostnameIngress,
  useRemoveHostnameIngress,
  useUpdateHostnameIngress,
} from '@/lib/queries/ingress'
import type { ApiMutationResult } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

export const SAVE_FIRST_HINT = 'Save this hostname before choosing its connection mode.'
/** An older control plane has no connection modes to offer. */
export const MODES_UNAVAILABLE = 'Direct. Connection modes need a newer control plane.'
export const SAVE_OTHERS_HINT = 'Save your other changes before changing a connection mode.'

/** The patch for a new mode: an edge mode picks the only matching account; others clear it. */
export function modeChangePatch(
  mode: IngressMode,
  record: Pick<InstanceHostnameRecord, 'publicPort'>,
  modes: readonly IngressCapabilities[],
  accounts: readonly IngressAccountRecord[]
): HostnameIngressPatch {
  const capability = capabilityFor(modes, mode)
  const provider = capability?.provider ?? null
  const matching = provider ? accounts.filter((account) => account.provider === provider) : []
  const patch: HostnameIngressPatch = {
    mode,
    ingressId: matching.length === 1 ? matching[0].id : null,
  }
  const publicPort = portForModeChange(capability, record.publicPort)
  return publicPort === undefined ? patch : { ...patch, publicPort }
}

export function ConnectionModeCell({
  record,
  modes,
  gate,
  accounts,
  lockedReason,
  busy,
}: Readonly<{
  record: InstanceHostnameRecord | null
  modes: readonly IngressCapabilities[]
  gate: EdgeGate | null
  accounts: readonly IngressAccountRecord[]
  /** Why the mode cannot change right now (unsaved row or unsaved edits), or null. */
  lockedReason: string | null
  busy: boolean
}>) {
  const update = useUpdateHostnameIngress()
  const [error, setError] = useState<string | null>(null)
  const mode = record?.mode ?? 'direct'
  const capability = capabilityFor(modes, mode)
  const locked = record === null || lockedReason !== null

  const send = async (patch: HostnameIngressPatch) => {
    if (!record) return
    setError(null)
    const result = await update.run({ id: record.id, patch })
    if (!result.ok) setError(result.error ?? 'Failed to change the connection mode')
    else if (!result.value.ok) setError(result.value.error)
  }

  if (modes.length === 0) {
    return <Text style={styles.muted}>{MODES_UNAVAILABLE}</Text>
  }

  return (
    <View style={styles.stack}>
      <Select
        value={mode}
        disabled={locked || busy || update.isPending}
        accessibilityLabel={`Connection mode for ${record?.host ?? 'this hostname'}`}
        placeholder="Connection Mode"
        options={connectionModeOptions(modes, gate, mode)}
        onChange={(value) => {
          if (!value || value === mode) return
          void send(modeChangePatch(value as IngressMode, record ?? {}, modes, accounts))
        }}
      />
      {lockedReason ? <Text style={styles.muted}>{lockedReason}</Text> : null}
      {capability?.provider && record ? (
        <AccountPicker
          record={record}
          provider={capability.provider}
          accounts={accounts}
          disabled={locked || busy || update.isPending}
          onChange={(ingressId) => void send({ ingressId })}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {capability?.provider && record ? (
        <IngressActions
          key={record.ingressId ?? 'no-account'}
          hostnameId={record.id}
          accountChosen={Boolean(record.ingressId)}
        />
      ) : null}
    </View>
  )
}

function AccountPicker({
  record,
  provider,
  accounts,
  disabled,
  onChange,
}: Readonly<{
  record: InstanceHostnameRecord
  provider: string
  accounts: readonly IngressAccountRecord[]
  disabled: boolean
  onChange: (ingressId: string | null) => void
}>) {
  const router = useRouter()
  const matching = accounts.filter((account) => account.provider === provider)
  if (matching.length === 0) {
    return (
      <TextLink
        label="Connect a Cloudflare account"
        size="sm"
        onPress={() => router.push('/admin/access/tunnel')}
      />
    )
  }
  return (
    <Select
      value={record.ingressId ?? null}
      disabled={disabled}
      accessibilityLabel={`Cloudflare account for ${record.host}`}
      placeholder="Cloudflare Account"
      options={matching.map((account) => ({
        value: account.id,
        label: account.label,
        detail: account.accountId,
      }))}
      onChange={(value) => onChange(value)}
    />
  )
}

type ApplyFeedback = { text: string; conflict: boolean } | null

/**
 * Preflight, then Connect (disabled until the preflight passes), and Disconnect.
 * Mounted with the account as its key, so a new account needs a new preflight.
 */
export function IngressActions({
  hostnameId,
  accountChosen,
}: Readonly<{ hostnameId: string; accountChosen: boolean }>) {
  const preflight = usePreflightHostnameIngress()
  const apply = useApplyHostnameIngress()
  const remove = useRemoveHostnameIngress()
  const [checks, setChecks] = useState<IngressCheck[] | null>(null)
  const [passed, setPassed] = useState(false)
  const [feedback, setFeedback] = useState<ApplyFeedback>(null)
  const pending = preflight.isPending || apply.isPending || remove.isPending

  const runPreflight = async () => {
    setFeedback(null)
    const result = await preflight.run(hostnameId)
    if (!result.ok) {
      setChecks(null)
      setPassed(false)
      setFeedback({ text: result.error ?? 'Preflight failed', conflict: false })
      return
    }
    setChecks(result.value.checks)
    setPassed(result.value.ok)
  }

  const runApply = async (replaceExisting: boolean) => {
    setFeedback(null)
    const result = await apply.run({ id: hostnameId, replaceExisting })
    setFeedback(applyFeedback(result))
  }

  const runRemove = async () => {
    setFeedback(null)
    const result = await remove.run(hostnameId)
    if (!result.ok) {
      setFeedback({ text: result.error ?? 'Disconnect failed', conflict: false })
      return
    }
    setPassed(false)
    setChecks(null)
  }

  return (
    <View style={styles.stack}>
      <View style={styles.actions}>
        <Button
          label="Preflight"
          busyLabel="Checking…"
          size="sm"
          busy={preflight.isPending}
          disabled={!accountChosen || pending}
          onPress={() => void runPreflight()}
        />
        <Button
          label="Connect"
          busyLabel="Connecting…"
          size="sm"
          variant="primary"
          busy={apply.isPending}
          disabled={!passed || pending}
          onPress={() => void runApply(false)}
        />
        <ConfirmButton
          label="Disconnect"
          prompt="Remove the tunnel route and DNS record for this name?"
          busy={remove.isPending}
          disabled={pending}
          onConfirm={() => void runRemove()}
          stacked
        />
      </View>
      {checks ? <CheckList checks={checks} /> : null}
      {feedback ? <Text style={styles.error}>{feedback.text}</Text> : null}
      {feedback?.conflict ? (
        <ConfirmButton
          label="Replace Existing Record"
          prompt="The existing DNS record for this name will be overwritten."
          busy={apply.isPending}
          disabled={pending}
          onConfirm={() => void runApply(true)}
          stacked
        />
      ) : null}
    </View>
  )
}

/**
 * What to say after Connect. The request can die in flight when this page is
 * itself reached through the tunnel being changed; that is not a failure, the
 * status read below the row says how it went.
 */
export function applyFeedback(result: ApiMutationResult<IngressApplyResult>): ApplyFeedback {
  if (!result.ok) {
    if (isControlPlaneRestartError(result.cause)) return null
    return { text: result.error ?? 'Connect failed', conflict: false }
  }
  const answer = result.value
  if (answer.ok) return null
  const sentence = APPLY_CAUSE_TEXT[answer.cause] ?? answer.cause
  const text = answer.detail ? `${sentence} ${answer.detail}` : sentence
  return { text, conflict: answer.cause === 'dns-conflict' }
}

/** The live connection phase for an edge row, with the cause on a second line. */
export function IngressPhaseChip({
  hostnameId,
  enabled,
}: Readonly<{ hostnameId: string; enabled: boolean }>) {
  const status = useHostnameIngressStatus(hostnameId, { enabled })
  if (!status.data) return null
  const presentation = INGRESS_PHASE_PRESENTATION[status.data.phase]
  const cause = status.data.detail ?? status.data.cause
  return (
    <View style={styles.stack}>
      <Badge label={presentation.label} tone={presentation.tone} />
      {cause ? <Text style={styles.muted}>{cause}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: { width: '100%', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  error: { color: colors.errorText, fontSize: 12, lineHeight: 17 },
})
