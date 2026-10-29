import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  TextField,
} from '@/components/ui'
import { AccountChoiceNeededError, BadgeInUseError } from '@/lib/instance-api'
import type { TunnelAccountChoice, TunnelBadge, TunnelCarrier } from '@/lib/instance-api'
import {
  useAddTunnelBadge,
  useAddTunnelBadgeZone,
  useCheckTunnelBadge,
  useConnectTunnelCarrier,
  useDeleteTunnelBadge,
  useDeleteTunnelCarrier,
  useRemoveTunnelBadgeZone,
  useTunnelCarriers,
} from '@/lib/queries/tunnels'
import { useCanState } from '@/lib/query-client'
import { spacing } from '@/lib/theme'
import {
  capabilitySummary,
  checkedLabel,
  dependentsSummary,
  expiryLabel,
  statusLabel,
  statusTone,
  tokenKindLabel,
  tokenProblem,
  tunnelErrorMessage,
  zoneBody,
  zoneProblem,
} from '@/lib/tunnels'

function missingLine(missing: readonly string[]): string {
  return `This API Token still needs: ${missing.join(', ')}.`
}

/** A refusal in words; a token others do not cover lists what still needs it. */
function blockedMessage(cause: unknown, fallback: string): string {
  if (cause instanceof BadgeInUseError) return dependentsSummary(cause.dependents, cause.total)
  return tunnelErrorMessage(cause, fallback)
}

function ErrorLine({ message }: Readonly<{ message: string | null }>) {
  if (!message) return null
  return (
    <Text style={panelStyles.error} accessibilityRole="alert">
      {message}
    </Text>
  )
}

/**
 * Two fields shared by "connect" and "add a token": a label and the pasted
 * token. The token field hides what is typed; it is sent once and never shown
 * again (only its last four characters).
 */
function TokenFields({
  label,
  token,
  onLabel,
  onToken,
  disabled,
  tokenError,
}: Readonly<{
  label: string
  token: string
  onLabel: (value: string) => void
  onToken: (value: string) => void
  disabled: boolean
  tokenError: string | null
}>) {
  return (
    <>
      <TextField
        label="Label"
        placeholder="e.g. Production tunnels"
        value={label}
        onChangeText={onLabel}
        editable={!disabled}
        accessibilityLabel="API Token label"
      />
      <TextField
        label="API Token"
        value={token}
        onChangeText={onToken}
        editable={!disabled}
        error={tokenError}
        hint="Create it in Cloudflare with permission to edit Cloudflare Tunnel. It is stored securely and never shown again."
        accessibilityLabel="API Token"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        mono
      />
    </>
  )
}

function AccountChoice({
  accounts,
  chosen,
  onToggle,
}: Readonly<{
  accounts: readonly TunnelAccountChoice[]
  chosen: readonly string[]
  onToggle: (id: string) => void
}>) {
  return (
    <View style={styles.choice}>
      <Text style={panelStyles.muted}>
        This API Token reaches more than one Cloudflare account. Choose which to connect.
      </Text>
      {accounts.map((account) => (
        <Checkbox
          key={account.id}
          checked={chosen.includes(account.id)}
          onPress={() => onToggle(account.id)}
          label={account.name}
          accessibilityLabel={`Connect ${account.name}`}
        />
      ))}
    </View>
  )
}

function ConnectPanel({ orgId }: Readonly<{ orgId: string }>) {
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [choices, setChoices] = useState<TunnelAccountChoice[] | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const connect = useConnectTunnelCarrier(orgId)

  const problem = token.length > 0 ? tokenProblem(token) : null
  const disabled = connect.isPending
  const canSend = !disabled && label.trim().length > 0 && token.trim().length > 0 && !problem

  async function send(accountIds?: string[]) {
    setError(null)
    setDone(null)
    const result = await connect.run({ label: label.trim(), token: token.trim(), accountIds })
    if (result.ok) {
      const count = result.value.connected.length
      const base = count === 1 ? 'Connected 1 Cloudflare account.' : `Connected ${count} accounts.`
      const missing = [...new Set(result.value.connected.flatMap((c) => c.missing))]
      setDone(missing.length > 0 ? `${base} ${missingLine(missing)}` : base)
      setLabel('')
      setToken('')
      setChoices(null)
      setChosen([])
      return
    }
    if (result.cause instanceof AccountChoiceNeededError) {
      setChoices(result.cause.accounts)
      setChosen([])
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to connect the Cloudflare account'))
  }

  function toggle(id: string) {
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <SectionPanel title="Connect an Account" hint="One API Token is enough">
      <Text style={panelStyles.muted}>
        Paste an API Token. TurboPanel finds the Cloudflare account it belongs to. Account-owned and
        user-owned tokens both work. A Global API Key does not.
      </Text>
      <Text style={panelStyles.muted}>
        A hostname you add to a tunnel has to sit in a zone of the same Cloudflare account. DNS can
        use separate API Tokens, one for each zone or group of zones: add them to the account below.
      </Text>
      <ErrorLine message={error} />
      {done ? <InlineNotice title={done} /> : null}
      <TokenFields
        label={label}
        token={token}
        onLabel={setLabel}
        onToken={(value) => {
          setToken(value)
          setChoices(null)
        }}
        disabled={disabled}
        tokenError={problem}
      />
      {choices ? <AccountChoice accounts={choices} chosen={chosen} onToggle={toggle} /> : null}
      <Button
        label={choices ? 'Connect Chosen Accounts' : 'Connect'}
        variant="primary"
        busy={disabled}
        disabled={!canSend || (choices !== null && chosen.length === 0)}
        onPress={() => void send(choices ? chosen : undefined)}
        accessibilityLabel="Connect Cloudflare account"
      />
    </SectionPanel>
  )
}

function BadgeRow({
  orgId,
  carrierId,
  badge,
  pending,
  onError,
}: Readonly<{
  orgId: string
  carrierId: string
  badge: TunnelBadge
  pending: boolean
  onError: (message: string | null) => void
}>) {
  const check = useCheckTunnelBadge(orgId, carrierId)
  const remove = useDeleteTunnelBadge(orgId, carrierId)
  const busy = check.isPending || remove.isPending
  const expiry = expiryLabel(badge.expiresAt)
  const [missing, setMissing] = useState<string[]>([])

  async function runCheck() {
    onError(null)
    const result = await check.run(badge.id)
    if (result.ok) setMissing(result.value.missing)
    else onError(tunnelErrorMessage(result.cause, 'Failed to check the API Token'))
  }

  async function runRemove() {
    onError(null)
    const result = await remove.run(badge.id)
    if (!result.ok) onError(blockedMessage(result.cause, 'Failed to remove the API Token'))
  }

  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.rowHeader}>
        <View style={styles.titleRow}>
          <Text style={panelStyles.detailTitle}>{badge.label}</Text>
          <MonoText>{`••••${badge.lastFour}`}</MonoText>
          <Badge label={statusLabel(badge.status)} tone={statusTone(badge.status)} />
        </View>
        <ButtonRow>
          <Button
            label="Check Now"
            size="sm"
            busy={check.isPending}
            disabled={pending || busy}
            onPress={() => void runCheck()}
            accessibilityLabel={`Check API Token ${badge.label}`}
          />
          <ConfirmButton
            label="Remove"
            confirmLabel="Remove API Token"
            prompt="Remove this API Token? Tunnels that depend on it stop being managed until you add another."
            stacked
            busy={remove.isPending}
            disabled={pending || busy}
            onConfirm={() => void runRemove()}
          />
        </ButtonRow>
      </View>
      <Text style={panelStyles.detailLine}>
        {tokenKindLabel(badge.kind)}. {capabilitySummary(badge)}.
      </Text>
      <Text style={panelStyles.muted}>
        {checkedLabel(badge.lastCheckedAt)}
        {expiry ? `. ${expiry}` : ''}
      </Text>
      {missing.length > 0 ? <Text style={panelStyles.muted}>{missingLine(missing)}</Text> : null}
      {(badge.warnings ?? []).map((warning) => (
        <InlineNotice key={warning} title={warning} />
      ))}
      <ZonesBlock
        orgId={orgId}
        carrierId={carrierId}
        badge={badge}
        disabled={pending || busy}
        onError={onError}
      />
    </View>
  )
}

/** The zones the person named for a token, and a way to name another. */
function ZonesBlock({
  orgId,
  carrierId,
  badge,
  disabled,
  onError,
}: Readonly<{
  orgId: string
  carrierId: string
  badge: TunnelBadge
  disabled: boolean
  onError: (message: string | null) => void
}>) {
  const zones = badge.declaredZones ?? []
  return (
    <View style={styles.list}>
      {zones.length > 0 ? (
        <Text style={panelStyles.muted}>
          Zones you named for this API Token. Every check looks at them again.
        </Text>
      ) : null}
      {zones.map((zone) => (
        <ZoneRow
          key={zone.id}
          orgId={orgId}
          carrierId={carrierId}
          badgeId={badge.id}
          zone={zone}
          disabled={disabled}
          onError={onError}
        />
      ))}
      <AddZoneForm
        orgId={orgId}
        carrierId={carrierId}
        badgeId={badge.id}
        disabled={disabled}
        onError={onError}
      />
    </View>
  )
}

function ZoneRow({
  orgId,
  carrierId,
  badgeId,
  zone,
  disabled,
  onError,
}: Readonly<{
  orgId: string
  carrierId: string
  badgeId: string
  zone: { id: string; name: string }
  disabled: boolean
  onError: (message: string | null) => void
}>) {
  const remove = useRemoveTunnelBadgeZone(orgId, carrierId, badgeId)

  async function run() {
    onError(null)
    const result = await remove.run(zone.id)
    if (!result.ok) onError(blockedMessage(result.cause, 'Failed to remove the zone'))
  }

  return (
    <View style={styles.titleRow}>
      <Text style={panelStyles.detailLine}>{zone.name || 'Zone'}</Text>
      <MonoText>{zone.id}</MonoText>
      <ConfirmButton
        label="Remove Zone"
        confirmLabel="Remove Zone"
        prompt="Stop naming this zone for the API Token? If the token can still reach it, nothing changes."
        stacked
        busy={remove.isPending}
        disabled={disabled}
        onConfirm={() => void run()}
      />
    </View>
  )
}

/**
 * A token limited to one zone is usually not allowed to list zones, so the
 * person names the zone: its id from the zone page in Cloudflare, and its name
 * only if Cloudflare asks for it. Cloudflare is asked with the token before the
 * zone is kept.
 */
function AddZoneForm({
  orgId,
  carrierId,
  badgeId,
  disabled,
  onError,
}: Readonly<{
  orgId: string
  carrierId: string
  badgeId: string
  disabled: boolean
  onError: (message: string | null) => void
}>) {
  const [open, setOpen] = useState(false)
  const [zoneId, setZoneId] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAddTunnelBadgeZone(orgId, carrierId, badgeId)
  const problem = zoneId.length > 0 || zoneName.length > 0 ? zoneProblem(zoneId, zoneName) : null
  const canSend = !add.isPending && zoneId.trim().length > 0 && !problem

  async function send() {
    setError(null)
    onError(null)
    const result = await add.run(zoneBody(zoneId, zoneName))
    if (result.ok) {
      setZoneId('')
      setZoneName('')
      setOpen(false)
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to add the zone'))
  }

  if (!open) {
    return (
      <ButtonRow>
        <Button
          label="Add Zone"
          size="sm"
          disabled={disabled}
          onPress={() => setOpen(true)}
          accessibilityLabel="Name a zone this API Token covers"
        />
      </ButtonRow>
    )
  }
  return (
    <View style={styles.form}>
      <ErrorLine message={error} />
      <TextField
        label="Zone ID"
        value={zoneId}
        onChangeText={setZoneId}
        editable={!add.isPending}
        error={problem && zoneId.trim().length === 0 ? problem : null}
        hint="From the zone's Overview page in Cloudflare."
        accessibilityLabel="Zone ID"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Zone Name (only if asked)"
        placeholder="example.com"
        value={zoneName}
        onChangeText={setZoneName}
        editable={!add.isPending}
        error={problem && zoneId.trim().length > 0 ? problem : null}
        accessibilityLabel="Zone name"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ButtonRow>
        <Button
          label="Check And Add"
          variant="primary"
          size="sm"
          busy={add.isPending}
          disabled={!canSend}
          onPress={() => void send()}
          accessibilityLabel="Check and add the zone"
        />
        <Button
          label="Cancel"
          size="sm"
          disabled={add.isPending}
          onPress={() => {
            setOpen(false)
            setError(null)
          }}
        />
      </ButtonRow>
    </View>
  )
}

function AddBadgeForm({
  orgId,
  carrierId,
  trailing,
}: Readonly<{ orgId: string; carrierId: string; trailing?: ReactNode }>) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [zoneId, setZoneId] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useAddTunnelBadge(orgId, carrierId)
  const problem = token.length > 0 ? tokenProblem(token) : null
  const named = zoneId.trim().length > 0 || zoneName.trim().length > 0
  const zoneIssue = named ? zoneProblem(zoneId, zoneName) : null
  const canSend =
    !add.isPending &&
    label.trim().length > 0 &&
    token.trim().length > 0 &&
    !problem &&
    zoneIssue === null

  async function send() {
    setError(null)
    const zones = named ? [zoneBody(zoneId, zoneName)] : undefined
    const result = await add.run({ label: label.trim(), token: token.trim(), zones })
    if (result.ok) {
      setLabel('')
      setToken('')
      setZoneId('')
      setZoneName('')
      setOpen(false)
      return
    }
    setError(tunnelErrorMessage(result.cause, 'Failed to add the API Token'))
  }

  if (!open) {
    return (
      <ButtonRow>
        <Button
          label="Add API Token"
          size="sm"
          onPress={() => setOpen(true)}
          accessibilityLabel="Add an API Token to this account"
        />
        {trailing}
      </ButtonRow>
    )
  }
  return (
    <View style={styles.form}>
      <ErrorLine message={error} />
      <TokenFields
        label={label}
        token={token}
        onLabel={setLabel}
        onToken={setToken}
        disabled={add.isPending}
        tokenError={problem}
      />
      <Text style={panelStyles.muted}>
        A token limited to one zone, for DNS only? Name the zone it covers, because Cloudflare does
        not let such a token list zones. Leave both empty for a token that can.
      </Text>
      <TextField
        label="Zone ID (optional)"
        value={zoneId}
        onChangeText={setZoneId}
        editable={!add.isPending}
        error={zoneIssue && zoneId.trim().length === 0 ? zoneIssue : null}
        accessibilityLabel="Zone ID"
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />
      <TextField
        label="Zone Name (only if asked)"
        placeholder="example.com"
        value={zoneName}
        onChangeText={setZoneName}
        editable={!add.isPending}
        error={zoneIssue && zoneId.trim().length > 0 ? zoneIssue : null}
        accessibilityLabel="Zone name"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ButtonRow>
        <Button
          label="Add"
          variant="primary"
          size="sm"
          busy={add.isPending}
          disabled={!canSend}
          onPress={() => void send()}
          accessibilityLabel="Add API Token"
        />
        <Button
          label="Cancel"
          size="sm"
          disabled={add.isPending}
          onPress={() => {
            setOpen(false)
            setError(null)
          }}
        />
      </ButtonRow>
    </View>
  )
}

function CarrierCard({ orgId, carrier }: Readonly<{ orgId: string; carrier: TunnelCarrier }>) {
  const [error, setError] = useState<string | null>(null)
  const remove = useDeleteTunnelCarrier(orgId)

  async function runRemove() {
    setError(null)
    const result = await remove.run(carrier.id)
    if (!result.ok) setError(tunnelErrorMessage(result.cause, 'Failed to remove the account'))
  }

  return (
    <SectionPanel
      title={carrier.name}
      hint={carrier.externalAccountId ? `Account ${carrier.externalAccountId}` : undefined}
    >
      <ErrorLine message={error} />
      <View style={styles.list}>
        {carrier.badges.length === 0 ? (
          <Text style={panelStyles.muted}>No API Tokens on this account yet.</Text>
        ) : null}
        {carrier.badges.map((badge) => (
          <BadgeRow
            key={badge.id}
            orgId={orgId}
            carrierId={carrier.id}
            badge={badge}
            pending={remove.isPending}
            onError={setError}
          />
        ))}
      </View>
      <AddBadgeForm
        orgId={orgId}
        carrierId={carrier.id}
        trailing={
          <ConfirmButton
            label="Remove Account"
            confirmLabel="Remove Account"
            prompt="Remove this account and its API Tokens from TurboPanel? Nothing is deleted in Cloudflare."
            stacked
            busy={remove.isPending}
            onConfirm={() => void runRemove()}
          />
        }
      />
    </SectionPanel>
  )
}

/**
 * Cloudflare accounts and the API Tokens TurboPanel uses for tunnels. Owners
 * and managers only. A token is pasted once and sealed by the panel; the list
 * shows the label and last four characters, never the token.
 */
export function NetworkCloudflareSection({ orgId }: Readonly<{ orgId: string }>) {
  const { allowed: canManage, loading: roleLoading } = useCanState(
    'organization',
    orgId,
    'organization:manage'
  )
  const query = useTunnelCarriers(orgId, { enabled: canManage })
  const carriers = query.data?.carriers ?? []

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Cloudflare Accounts</Text>
      <Text style={panelStyles.pageCopy}>
        The Cloudflare accounts and API Tokens TurboPanel uses to run tunnels for your sites. A
        tunnel lets visitors reach a site without opening a port to the internet.
      </Text>
      {roleLoading ? <LoadingState label="Checking your access…" /> : null}
      {canManage || roleLoading ? null : (
        <Text style={panelStyles.muted}>
          Only owners and managers can manage Cloudflare accounts.
        </Text>
      )}
      {canManage ? <ConnectPanel orgId={orgId} /> : null}
      {query.isError ? (
        <ErrorLine
          message={tunnelErrorMessage(query.error, 'Failed to load Cloudflare accounts')}
        />
      ) : null}
      {canManage && query.isLoading ? <LoadingState label="Loading Cloudflare accounts…" /> : null}
      {canManage && !query.isLoading && carriers.length === 0 ? (
        <EmptyState
          title="No Cloudflare accounts yet."
          hint="Connect one above to use tunnels."
          panel
        />
      ) : null}
      {carriers.map((carrier) => (
        <CarrierCard key={carrier.id} orgId={orgId} carrier={carrier} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: spacing.lg },
  list: { gap: spacing.sm },
  choice: { gap: spacing.sm },
  form: { gap: spacing.sm },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
})
