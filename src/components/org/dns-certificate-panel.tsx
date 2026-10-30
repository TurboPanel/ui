import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  EmptyState,
  FormField,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  SettingRow,
  Select,
  TextField,
  Toggle,
} from '@/components/ui'
import type { DnsCertificate, TunnelCarrier } from '@/lib/instance-api'
import {
  dnsCapableCarriers,
  dnsCertificateErrorMessage,
  EMPTY_ORDER_DRAFT,
  expiryLabel,
  nextTryLabel,
  orderNames,
  orderProblem,
  progressLabel,
  renewalLabel,
  stageLabel,
  statusLabel,
  statusTone,
  type OrderDraft,
  type OrderMode,
} from '@/lib/dns-certificates'
import {
  useAdvanceRunningOrders,
  useCheckDnsCertificate,
  useDnsCertificates,
  useOrderDnsCertificate,
  useRetryDnsCertificate,
} from '@/lib/queries/dns-certificates'
import { useTunnelCarriers } from '@/lib/queries/tunnels'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const MODE_OPTIONS = [
  { value: 'exact', label: 'Exact Names' },
  { value: 'wildcard', label: 'Use A Wildcard Certificate' },
] as const

function OrderForm({
  orgId,
  acmeEnabled,
  carriers,
}: Readonly<{ orgId: string; acmeEnabled: boolean; carriers: readonly TunnelCarrier[] }>) {
  const capable = dnsCapableCarriers(carriers)
  const [draft, setDraft] = useState<OrderDraft>(EMPTY_ORDER_DRAFT)
  const [test, setTest] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const order = useOrderDnsCertificate(orgId)

  // A lone account that can edit DNS is the only choice, so it needs no picking.
  const carrierId = draft.carrierId ?? (capable.length === 1 ? (capable[0]?.id ?? null) : null)
  const effective = { ...draft, carrierId }
  const problem = orderProblem(effective)
  const canSend = acmeEnabled && !order.isPending && problem === null

  async function send() {
    if (!carrierId || problem !== null) return
    setError(null)
    setDone(null)
    const result = await order.run({ carrierId, names: orderNames(effective), staging: test })
    if (!result.ok) {
      setError(dnsCertificateErrorMessage(result.cause, 'Failed to order the certificate'))
      return
    }
    setDone(
      result.value.reused
        ? 'A certificate that already covers these names was found, so nothing new was ordered.'
        : 'The order has started. It usually takes under a minute; its progress shows below.'
    )
    setDraft(EMPTY_ORDER_DRAFT)
  }

  if (capable.length === 0) {
    return (
      <SectionPanel title="Order A Certificate" hint="Needs a Cloudflare account first">
        <Text style={panelStyles.muted}>
          Connect a Cloudflare account with an API Token that can edit DNS, under Cloudflare
          Accounts. Then you can order a certificate here.
        </Text>
      </SectionPanel>
    )
  }

  return (
    <SectionPanel
      title="Order A Certificate"
      hint="Proved with a DNS record in your Cloudflare account"
    >
      <Text style={panelStyles.muted}>
        TurboPanel orders the certificate from Let&apos;s Encrypt and proves you own the names by
        adding a short-lived DNS record in your Cloudflare account, then removes it. It works before
        a site exists, for names behind a tunnel, and with no open port.
      </Text>
      {acmeEnabled ? null : (
        <Text style={panelStyles.muted}>
          Turn on &ldquo;Allow Let&apos;s Encrypt certificates&rdquo; above to order one.
        </Text>
      )}
      {error ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {done ? <Text style={panelStyles.muted}>{done}</Text> : null}
      <View style={styles.form}>
        {capable.length > 1 ? (
          <FormField label="Cloudflare Account">
            <Select
              value={carrierId}
              options={capable.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="Choose an account"
              disabled={order.isPending}
              accessibilityLabel="Cloudflare account that hosts the DNS"
              onChange={(id) => setDraft({ ...draft, carrierId: id })}
            />
          </FormField>
        ) : (
          <Text style={panelStyles.muted}>Account: {capable[0]?.name}</Text>
        )}
        <SegmentedControl
          options={MODE_OPTIONS}
          value={draft.mode}
          onChange={(mode: OrderMode) => setDraft({ ...draft, mode })}
          accessibilityLabel="Which names the certificate covers"
        />
        {draft.mode === 'exact' ? (
          <TextField
            label="Names"
            value={draft.namesText}
            onChangeText={(namesText) => setDraft({ ...draft, namesText })}
            editable={!order.isPending}
            multiline
            hint="One per line, or separated by commas. For example app.example.com."
            accessibilityLabel="Names for the certificate"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : (
          <>
            <TextField
              label="Domain"
              value={draft.domain}
              onChangeText={(domain) => setDraft({ ...draft, domain })}
              editable={!order.isPending}
              placeholder="example.com"
              hint="Covers this domain and every name directly under it, such as shop.example.com. It does not cover names two levels down."
              accessibilityLabel="Domain for the wildcard certificate"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={panelStyles.muted}>
              A wildcard can answer for any name under the domain, so its key is worth more to
              anyone who gets it. Exact names are the safer choice unless you need a wildcard.
            </Text>
          </>
        )}
        <SettingRow
          label="Test Certificates"
          description="Order from Let’s Encrypt’s test service instead. Test certificates are only for trying out ordering. Browsers show a security warning for them, so they can’t be attached to a site."
        >
          <Toggle
            value={test}
            onValueChange={setTest}
            disabled={order.isPending}
            accessibilityLabel="Test Certificates"
          />
        </SettingRow>
        {problem && draft.namesText + draft.domain !== '' ? (
          <Text style={panelStyles.muted}>{problem}</Text>
        ) : null}
        <Button
          label="Order Certificate"
          variant="primary"
          busy={order.isPending}
          disabled={!canSend}
          onPress={() => void send()}
          accessibilityLabel="Order certificate"
        />
      </View>
    </SectionPanel>
  )
}

function CertificateCard({
  orgId,
  certificate,
}: Readonly<{ orgId: string; certificate: DnsCertificate }>) {
  const check = useCheckDnsCertificate(orgId)
  const retry = useRetryDnsCertificate(orgId)
  const [error, setError] = useState<string | null>(null)
  const progress = progressLabel(certificate)
  const lines = [
    expiryLabel(certificate),
    renewalLabel(certificate),
    nextTryLabel(certificate),
  ].filter((line): line is string => line !== null)

  async function run(action: 'check' | 'retry') {
    setError(null)
    const result = await (action === 'check' ? check : retry).run(certificate.id)
    if (!result.ok) {
      setError(dnsCertificateErrorMessage(result.cause, 'Failed to update the order'))
    }
  }

  return (
    <View style={panelStyles.detailCard}>
      <Text style={panelStyles.detailTitle}>{certificate.names.join(', ')}</Text>
      <View style={styles.badges}>
        <Badge label={statusLabel(certificate)} tone={statusTone(certificate)} />
        {certificate.staging ? <Badge label="Test Certificate" tone="info" /> : null}
        {certificate.wildcard ? <Badge label="Wildcard" tone="muted" /> : null}
      </View>
      <Text style={panelStyles.muted}>
        {stageLabel(certificate)}
        {progress ? ` ${progress}.` : ''}
      </Text>
      {lines.map((line) => (
        <Text key={line} style={panelStyles.muted}>
          {line}
        </Text>
      ))}
      {certificate.staging ? (
        <Text style={panelStyles.muted}>
          Test certificates are only for trying out ordering. Browsers show a security warning for
          them, so they can&apos;t be attached to a site.
        </Text>
      ) : null}
      {certificate.lastError ? (
        <Text style={panelStyles.error}>The last try failed: {certificate.lastError}</Text>
      ) : null}
      {certificate.warning ? (
        <Text style={panelStyles.error} accessibilityRole="alert">
          {certificate.warning}
        </Text>
      ) : null}
      <ButtonRow>
        {certificate.status === 'pending' ? (
          <Button
            label="Check Now"
            busy={check.isPending}
            onPress={() => void run('check')}
            accessibilityLabel={`Check ${certificate.names[0] ?? 'the'} order now`}
          />
        ) : null}
        {certificate.status === 'failed' ? (
          <Button
            label="Try Again"
            variant="primary"
            busy={retry.isPending}
            onPress={() => void run('retry')}
            accessibilityLabel={`Try ${certificate.names[0] ?? 'the'} order again`}
          />
        ) : null}
      </ButtonRow>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

function OrderedList({ orgId }: Readonly<{ orgId: string }>) {
  const query = useDnsCertificates(orgId)
  const running = (query.data?.certificates ?? [])
    .filter((row) => row.status === 'pending')
    .map((row) => row.id)
  useAdvanceRunningOrders(orgId, running)
  if (query.isLoading) return <LoadingState label="Loading certificates…" />
  if (query.isError) {
    return (
      <Text style={panelStyles.error}>
        {dnsCertificateErrorMessage(query.error, 'Failed to load the ordered certificates')}
      </Text>
    )
  }
  const rows = query.data?.certificates ?? []
  if (rows.length === 0) return <EmptyState title="No certificates ordered here yet." />
  return rows.map((row) => <CertificateCard key={row.id} orgId={orgId} certificate={row} />)
}

/**
 * The order form waits for the Cloudflare accounts: until they load it cannot
 * tell whether one is connected, so it says loading (or why it could not
 * load) instead of asking for an account.
 */
function CarriersPending({ error }: Readonly<{ error: unknown }>) {
  return (
    <SectionPanel title="Order A Certificate">
      {error ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(error, 'Could not load the Cloudflare accounts.')}
        </Text>
      ) : (
        <LoadingState label="Loading Cloudflare accounts…" />
      )}
    </SectionPanel>
  )
}

/**
 * Certificates TurboPanel orders itself through a DNS challenge: the order
 * form (exact names, or a wildcard that has to be asked for) and the orders'
 * progress. Delete one in the certificate list above.
 */
export function DnsCertificatePanel({
  orgId,
  acmeEnabled,
}: Readonly<{ orgId: string; acmeEnabled: boolean }>) {
  const carriers = useTunnelCarriers(orgId)
  return (
    <View style={styles.root}>
      {carriers.data ? (
        <OrderForm orgId={orgId} acmeEnabled={acmeEnabled} carriers={carriers.data.carriers} />
      ) : (
        <CarriersPending error={carriers.error} />
      )}
      <SectionPanel
        title="Ordered By TurboPanel"
        hint="Certificates TurboPanel orders and renews itself"
      >
        <OrderedList orgId={orgId} />
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  form: { gap: spacing.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
})
