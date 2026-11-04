import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, ButtonRow, LoadingState, SectionPanel } from '@/components/ui'
import { certificateCoverage } from '@/lib/certificate-coverage'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { InstanceHostnameRecord, PanelDnsCertificate, PanelDnsStage } from '@/lib/instance-api'
import {
  dns01Ladder,
  DNS01_STOPPED_LABELS,
  dns01WorkingLabel,
  type LadderStep,
  panelDnsCauseLabel,
  retryPausedUntil,
} from '@/lib/panel-certificate-causes'
import { useOrderPanelDnsCertificate, usePanelDnsCertificate } from '@/lib/queries/ingress'
import { colors, spacing } from '@/lib/theme'

export const TRANSPARENCY_NOTE =
  'Every issued name is listed in public certificate transparency logs.'

/** One row per `acme-dns-01` hostname: the ladder, the times, Order Now and Retry. */
export function Dns01CertificatesPanel({
  hostnames,
  enabled,
}: Readonly<{ hostnames: readonly InstanceHostnameRecord[]; enabled: boolean }>) {
  const rows = hostnames.filter((row) => row.source === 'acme-dns-01')
  return (
    <SectionPanel
      title="DNS-01 Certificates"
      hint="Issued through the connected Cloudflare account"
    >
      <Text style={panelStyles.muted}>{TRANSPARENCY_NOTE}</Text>
      {rows.length === 0 ? (
        <Text style={panelStyles.muted}>
          No hostname uses DNS-01. Choose DNS-01 as a hostname&apos;s certificate on the Hostnames
          screen.
        </Text>
      ) : null}
      {rows.map((row) => (
        <Dns01Row key={row.id} record={row} enabled={enabled} />
      ))}
    </SectionPanel>
  )
}

function Dns01Row({
  record,
  enabled,
}: Readonly<{ record: InstanceHostnameRecord; enabled: boolean }>) {
  const query = usePanelDnsCertificate(record.id, { enabled })
  return (
    <View style={styles.row}>
      <Text selectable style={styles.host}>
        {record.host}
      </Text>
      {query.isError ? (
        <Text style={panelStyles.error}>Failed to load the certificate state</Text>
      ) : null}
      {query.data ? (
        <Dns01State id={record.id} state={query.data} now={query.dataUpdatedAt} />
      ) : null}
      {query.isLoading ? <LoadingState /> : null}
    </View>
  )
}

/** Order Now / Retry for one name, with the refusal or request error to show beside the buttons. */
function useDns01Order(id: string) {
  const order = useOrderPanelDnsCertificate()
  const [error, setError] = useState<string | null>(null)
  const run = async (retry: boolean) => {
    setError(null)
    const result = await order.run({ id, retry })
    if (!result.ok) setError(result.error ?? 'Request failed')
    else if (!result.value.ok) setError(result.value.error)
  }
  return { order, error, run }
}

function RetryButton({
  order,
  disabled,
  onPress,
}: Readonly<{
  order: ReturnType<typeof useOrderPanelDnsCertificate>
  disabled: boolean
  onPress: () => void
}>) {
  return (
    <Button
      label="Retry"
      busyLabel="Retrying…"
      size="sm"
      busy={order.isPending && order.variables?.retry === true}
      disabled={order.isPending || disabled}
      onPress={onPress}
    />
  )
}

function PausedNote({ until }: Readonly<{ until: string | null }>) {
  if (!until) return null
  return <Text style={styles.muted}>Retry is paused until {formatLocalDateTime(until)}.</Text>
}

export function Dns01State({
  id,
  state,
  now,
}: Readonly<{
  id: string
  state: PanelDnsCertificate
  /** When the state was read; a pause is judged against it. */
  now: number
}>) {
  const { order, error, run } = useDns01Order(id)
  const pausedUntil = retryPausedUntil(state, now)

  return (
    <View style={styles.state}>
      <Dns01Ladder stage={state.stage} />
      <StoppedLine state={state} />
      <View style={styles.facts}>
        <Text style={styles.fact}>
          Next Attempt: {formatLocalDateTime(state.nextAttemptAt, { fallback: 'None' })}
        </Text>
        <Text style={styles.fact}>
          Renew At: {formatLocalDateTime(state.renewAt, { fallback: 'Not issued' })}
        </Text>
        <Text style={styles.fact}>
          Expires: {formatLocalDateTime(state.notAfter, { fallback: 'Not issued' })}
        </Text>
      </View>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <PausedNote until={pausedUntil} />
      <ButtonRow>
        <Button
          label="Order Now"
          busyLabel="Ordering…"
          size="sm"
          variant="primary"
          busy={order.isPending && !order.variables?.retry}
          disabled={order.isPending || pausedUntil !== null}
          onPress={() => void run(false)}
        />
        <RetryButton order={order} disabled={pausedUntil !== null} onPress={() => void run(true)} />
      </ButtonRow>
    </View>
  )
}

/**
 * The DNS-01 line under a hostname's status on the Hostnames screen: while an
 * order runs, the step it is on; once it failed or backs off, the cause, the
 * detail, when it happened and a Retry button.
 */
export function Dns01HostnameStatus({
  hostnameId,
  enabled,
}: Readonly<{ hostnameId: string; enabled: boolean }>) {
  const query = usePanelDnsCertificate(hostnameId, { enabled })
  if (!query.data) return null
  return <Dns01RowNote id={hostnameId} state={query.data} now={query.dataUpdatedAt} />
}

export function Dns01RowNote({
  id,
  state,
  now,
}: Readonly<{ id: string; state: PanelDnsCertificate; now: number }>) {
  const { order, error, run } = useDns01Order(id)
  const working = dns01WorkingLabel(state.stage)
  const stopped = state.stage === 'failed' || state.stage === 'backoff'
  const pausedUntil = retryPausedUntil(state, now)
  if (!working && !stopped && !error) return null
  return (
    <View style={styles.rowNote}>
      {working ? <Text style={styles.muted}>DNS-01: {working}…</Text> : null}
      {stopped ? <StoppedLine state={state} /> : null}
      {stopped && state.stage === 'backoff' ? (
        <Text style={styles.fact}>
          Next Attempt: {formatLocalDateTime(state.nextAttemptAt, { fallback: 'None' })}
        </Text>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      <PausedNote until={stopped ? pausedUntil : null} />
      {stopped ? (
        <RetryButton order={order} disabled={pausedUntil !== null} onPress={() => void run(true)} />
      ) : null}
    </View>
  )
}

function StoppedLine({ state }: Readonly<{ state: PanelDnsCertificate }>) {
  const stopped = DNS01_STOPPED_LABELS[state.stage]
  if (!stopped && !state.lastError) return null
  return (
    <View style={styles.stopped}>
      {stopped ? (
        <Badge label={stopped} tone={state.stage === 'failed' ? 'danger' : 'pending'} />
      ) : null}
      {state.lastError ? (
        <Text style={styles.cause}>
          {panelDnsCauseLabel(state.lastError.cause)}: {state.lastError.detail}
        </Text>
      ) : null}
      {state.lastError?.at ? (
        <Text style={styles.fact}>Last Failure: {formatLocalDateTime(state.lastError.at)}</Text>
      ) : null}
    </View>
  )
}

const STEP_TONE: Readonly<Record<LadderStep['state'], 'ok' | 'info' | 'muted'>> = {
  done: 'ok',
  current: 'info',
  todo: 'muted',
}

/** Idle → Issued, left to right; the current step is the one highlighted. */
export function Dns01Ladder({ stage }: Readonly<{ stage: PanelDnsStage }>) {
  return (
    <View style={styles.ladder} accessibilityRole="list">
      {dns01Ladder(stage).map((step) => (
        <View
          key={step.stage}
          accessibilityLabel={`${step.label}${step.state === 'current' ? ', current step' : ''}`}
          aria-selected={step.state === 'current'}
        >
          <Badge label={step.label} tone={STEP_TONE[step.state]} />
        </View>
      ))}
    </View>
  )
}

/** Covered / Not Covered for every control plane hostname, for one uploaded pair. */
export function CoverageChips({
  dnsNames,
  hostnames,
}: Readonly<{ dnsNames: readonly string[]; hostnames: readonly string[] }>) {
  if (hostnames.length === 0) return null
  return (
    <View style={styles.ladder}>
      {certificateCoverage(dnsNames, hostnames).map((item) => (
        <Badge
          key={item.host}
          label={`${item.host}: ${item.covered ? 'Covered' : 'Not Covered'}`}
          tone={item.covered ? 'ok' : 'muted'}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  host: { color: colors.stdout, fontFamily: 'monospace', fontSize: 13 },
  state: { gap: spacing.sm },
  rowNote: { gap: spacing.xs, alignItems: 'flex-start', marginTop: spacing.xs },
  ladder: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  stopped: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  cause: { color: colors.errorText, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  fact: { color: colors.textMuted, fontSize: 12 },
  muted: { color: colors.textMuted, fontSize: 12 },
})
