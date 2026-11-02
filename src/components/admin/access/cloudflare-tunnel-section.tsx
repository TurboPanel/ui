import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CloudflareAccountCard } from '@/components/admin/access/cloudflare-account-card'
import { TunnelHealthPanel } from '@/components/admin/access/tunnel-health-panel'
import { TunnelStatusPanel } from '@/components/admin/access/tunnel-status-panel'
import { CheckList } from '@/components/admin/access/check-list'
import { TunnelTokenPanel } from '@/components/admin/access/tunnel-section'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  InlineNotice,
  LoadingState,
  SectionPanel,
  TextField,
  TextLink,
} from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { EdgeGate, IngressCheck } from '@/lib/instance-api'
import {
  useAddIngressAccount,
  useIngressAccounts,
  useIngressCapabilities,
  useSetEdgeGate,
} from '@/lib/queries/ingress'
import { useInstanceHostnames } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'
import { TUNNEL_PROVIDER_LABEL } from '@/lib/tunnel-status'

export const CONNECTOR_NOTICE =
  'The tunnel connector runs on the control plane host only. Other servers never receive the tunnel token.'

export const EDGE_GATE_WARNING =
  'Confirm this only once every server trusts this control plane. A server that does not trust it loses its connection when an edge mode is applied.'

export function CloudflareTunnelSection() {
  const { controlPlaneRuntime } = useAuth()
  if (controlPlaneRuntime === 'workers') {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.pageTitle}>Cloudflare Tunnel</Text>
        <InlineNotice
          title="Not applicable on this runtime"
          body="TurboPanel High Availability is already served from a global edge network. There is no control plane host here to run a tunnel connector on."
        />
      </View>
    )
  }
  return <CloudflareTunnelScreen />
}

export const MANAGED_TUNNEL_COPY =
  "Enter one Cloudflare API token. The control plane creates the tunnel, or adopts the one your hostname already points at (its other routes are kept and it is never deleted), manages the DNS records, and issues and renews a DNS-01 Let's Encrypt certificate for each name."

function CloudflareTunnelScreen() {
  const capabilities = useIngressCapabilities()
  const accounts = useIngressAccounts()
  const hostnames = useInstanceHostnames()
  const [tokenOpen, setTokenOpen] = useState(false)
  const records = hostnames.data?.hostnames ?? []

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Cloudflare Tunnel</Text>
      <View style={styles.provider}>
        <Text style={styles.providerLabel}>Provider</Text>
        <Text style={styles.providerValue}>{TUNNEL_PROVIDER_LABEL}</Text>
        <Text style={panelStyles.muted}>More tunnel types may come later.</Text>
      </View>
      <InlineNotice title="Control Plane Host Only" body={CONNECTOR_NOTICE} />
      <TunnelStatusPanel hostnames={records} />
      <SectionPanel title="Managed by an API Token" hint="The main way to run this tunnel">
        <Text style={styles.body}>{MANAGED_TUNNEL_COPY}</Text>
        {accounts.isError ? (
          <Text style={panelStyles.error}>Failed to load Cloudflare accounts</Text>
        ) : null}
        {accounts.isLoading ? <LoadingState /> : null}
        {(accounts.data?.accounts ?? []).map((account) => (
          <CloudflareAccountCard
            key={account.id}
            account={account}
            usedBy={records.filter((row) => row.ingressId === account.id).map((row) => row.host)}
          />
        ))}
        <AddAccountForm />
      </SectionPanel>
      <EdgeGatePanel gate={capabilities.data?.gate ?? null} loading={capabilities.isLoading} />
      <TunnelHealthPanel hostnames={records} />
      <TextLink
        label="Paste a run token instead"
        size="sm"
        expanded={tokenOpen}
        onPress={() => setTokenOpen((open) => !open)}
      />
      {tokenOpen ? <TunnelTokenPanel /> : null}
    </View>
  )
}

function gateState(gate: EdgeGate): string {
  if (gate.forcedClosed) {
    return 'Edge modes are held off on this host by its configuration. They cannot be switched on here.'
  }
  if (gate.open && gate.confirmedAt) {
    const by = gate.confirmedBy ? ` by ${gate.confirmedBy}` : ''
    return `Edge modes are on. Confirmed ${formatLocalDateTime(gate.confirmedAt)}${by}.`
  }
  return gate.reason ?? 'Edge modes are off.'
}

export function EdgeGatePanel({
  gate,
  loading,
}: Readonly<{ gate: EdgeGate | null; loading: boolean }>) {
  const mutation = useSetEdgeGate()
  const [error, setError] = useState<string | null>(null)

  const setGate = async (confirmed: boolean) => {
    setError(null)
    const result = await mutation.run(confirmed)
    if (!result.ok && result.error) setError(result.error)
  }

  return (
    <SectionPanel title="Edge Go-Live" hint="Switches the edge connection modes on or off">
      {loading || !gate ? (
        <LoadingState />
      ) : (
        <>
          <InlineNotice
            tone="warning"
            title="Every Server Must Trust This Control Plane"
            body={EDGE_GATE_WARNING}
          />
          <Text style={styles.body}>{gateState(gate)}</Text>
          {error ? <Text style={panelStyles.error}>{error}</Text> : null}
          <ButtonRow>
            {gate.open ? (
              <ConfirmButton
                label="Switch Edge Modes Off"
                prompt="Hostnames already connected stay connected. New edge connections are refused."
                busy={mutation.isPending}
                disabled={gate.forcedClosed}
                onConfirm={() => void setGate(false)}
                stacked
              />
            ) : (
              <ConfirmButton
                label="Confirm Edge Go-Live"
                prompt="Switch edge modes on for every hostname?"
                variant="secondary"
                busy={mutation.isPending}
                disabled={gate.forcedClosed}
                onConfirm={() => void setGate(true)}
                stacked
              />
            )}
          </ButtonRow>
        </>
      )}
    </SectionPanel>
  )
}

export function AddAccountForm() {
  const mutation = useAddIngressAccount()
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [checks, setChecks] = useState<IngressCheck[]>([])
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState(false)

  const submit = async () => {
    const sent = token.trim()
    setToken('')
    setError(null)
    setAdded(false)
    const result = await mutation.run({ provider: 'cloudflare', label: label.trim(), token: sent })
    // The sent token must not stay in the mutation cache.
    mutation.reset()
    if (!result.ok) {
      setChecks([])
      setError(result.error ?? 'Failed to connect the account')
      return
    }
    const answer = result.value
    setChecks(answer.preflight?.checks ?? [])
    if (answer.ok) {
      setLabel('')
      setAdded(true)
      return
    }
    setError(answer.error)
  }

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>Add a Cloudflare Account</Text>
      <TextField
        label="Label"
        value={label}
        onChangeText={setLabel}
        editable={!mutation.isPending}
      />
      <TextField
        label="Token"
        hint="An API token with Cloudflare Tunnel edit and DNS edit on the zones this control plane uses."
        value={token}
        onChangeText={(value) => {
          setToken(value)
          setAdded(false)
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!mutation.isPending}
      />
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {added ? <Text style={styles.saved}>Account connected.</Text> : null}
      <CheckList checks={checks} />
      <ButtonRow>
        <Button
          label="Connect Account"
          busyLabel="Checking…"
          variant="primary"
          busy={mutation.isPending}
          disabled={label.trim() === '' || token.trim() === '' || mutation.isPending}
          onPress={() => void submit()}
        />
      </ButtonRow>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  form: { gap: spacing.sm },
  provider: { gap: 2 },
  providerLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  providerValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  formTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  saved: { color: colors.ok, fontSize: 13, fontWeight: '600', lineHeight: 18 },
})
