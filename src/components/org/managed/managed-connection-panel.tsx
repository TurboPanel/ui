import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, CopyButton, SectionPanel } from '@/components/ui'
import { downloadCaBundle, downloadSuccessMessage } from '@/lib/download-ca'
import type {
  ManagedAccessEndpoint,
  ManagedConnectionInfo,
  ManagedEnvironmentRecord,
  ManagedMemberRecord,
  ManagedServerSummary,
  ManagedServiceEngine,
  ManagedSslView,
  ManagedUserRecord,
} from '@/lib/managed-services'
import { managedIngressPortForEngine } from '@/lib/managed-ingress-ports'
import { managedAccessScopeLabel } from '@/lib/managed-access-scope'
import {
  DEFAULT_MANAGED_SSL_MODE,
  describeManagedSslPolicy,
} from '@/lib/managed-ssl'
import {
  hasReadEligibleReplica,
  readOnlyLoginNames,
} from '@/lib/managed-read-endpoint'
import { useOrganizationCa } from '@/lib/queries/managed'
import { colors, spacing } from '@/lib/theme'

function endpointLabel(
  managed: ManagedEnvironmentRecord,
  connection: ManagedConnectionInfo | null,
): string {
  if (connection) {
    return `${connection.host}:${connection.port}`
  }
  if (managed.status === 'provisioning' || managed.status === 'applying') {
    return 'Provisioning…'
  }
  return 'Not exposed'
}

/**
 * Port the shared listener actually publishes.
 *
 * The resolved value from the API wins because listener ports are an
 * organization setting — the platform constant is only a pre-provisioning
 * placeholder, and stating it once an org has moved the port would be wrong.
 */
function protocolPort(
  engine: ManagedServiceEngine | null,
  connection: ManagedConnectionInfo | null,
  managed: ManagedEnvironmentRecord,
): number | null {
  const resolved = connection?.port ?? managed.port
  if (typeof resolved === 'number') return resolved
  if (!engine) return null
  return managedIngressPortForEngine(engine)
}

function serverLabel(server: ManagedServerSummary | null): string {
  if (!server) {
    return '—'
  }
  return server.name?.trim() || server.hostname?.trim() || server.id
}

/**
 * Reads only leave the primary when the client authenticates as a read-only
 * login, so this block names the credential instead of implying the shared
 * endpoint load-balances reads on its own.
 */
function ReadOnlyConnectionBlock({
  endpoint,
  logins,
}: Readonly<{ endpoint: string; logins: readonly string[] }>) {
  return (
    <>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>Read-only endpoint: </Text>
        {endpoint}
      </Text>
      <Text style={panelStyles.muted}>
        Same host and port. A read-only login is routed to replicas that serve
        reads; the read/write login above always reaches the current primary.
      </Text>
      {logins.length > 0 ? (
        <View style={styles.loginRow}>
          {logins.map((login) => (
            <View key={login} style={styles.loginChip}>
              <Text style={styles.loginChipText}>{login}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={panelStyles.muted}>
          No read-only login yet — create one under Users &amp; databases and
          set its connection role to Read-only.
        </Text>
      )}
    </>
  )
}

/**
 * Resolved client TLS policy. Falls back to the platform mode when the detail
 * response predates the `ssl` block so the panel never claims a stricter policy
 * than the listener actually enforces.
 */
function TlsPolicyLines({
  engine,
  ssl,
}: Readonly<{
  engine: ManagedServiceEngine | null
  ssl: ManagedSslView | null | undefined
}>) {
  const policy = describeManagedSslPolicy(
    engine,
    ssl ?? {
      configured: null,
      effective: DEFAULT_MANAGED_SSL_MODE,
      organizationDefault: null,
    },
  )
  return (
    <>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>TLS: </Text>
        {policy.param} ({policy.enforcement}) · {policy.source}
      </Text>
      {policy.verifies ? (
        <Text style={panelStyles.muted}>
          Clients verify the certificate, so they need the Organization CA below.
        </Text>
      ) : null}
    </>
  )
}

function EndpointList({
  endpoints,
}: Readonly<{ endpoints: readonly ManagedAccessEndpoint[] }>) {
  if (endpoints.length === 0) {
    return null
  }
  return (
    <View style={styles.endpointList}>
      <Text style={panelStyles.detailLabel}>Reachable endpoints</Text>
      {endpoints.map((entry) => (
        <Text key={`${entry.scope}-${entry.host}`} style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>
            {managedAccessScopeLabel(entry.scope)}:{' '}
          </Text>
          {entry.host}:{entry.port}
        </Text>
      ))}
    </View>
  )
}

export function ManagedConnectionPanel({
  orgId,
  managed,
  connection,
  endpoints,
  server,
  members,
  users,
  ssl,
}: Readonly<{
  orgId: string
  managed: ManagedEnvironmentRecord
  connection: ManagedConnectionInfo | null
  endpoints?: readonly ManagedAccessEndpoint[]
  server: ManagedServerSummary | null
  members?: readonly ManagedMemberRecord[]
  users?: readonly ManagedUserRecord[]
  /** From the detail response; resolved service override → org default → platform. */
  ssl?: ManagedSslView | null
}>) {
  const [caBusy, setCaBusy] = useState(false)
  const [caMessage, setCaMessage] = useState<string | null>(null)
  const [caError, setCaError] = useState<string | null>(null)
  const caQuery = useOrganizationCa(orgId)
  const overlapping =
    (caQuery.data?.trustBundlePem?.match(/BEGIN CERTIFICATE/g)?.length ?? 0) > 1

  const hasReadEligible = hasReadEligibleReplica(members)
  const readOnlyLogins = readOnlyLoginNames(users)
  const port = protocolPort(managed.engine, connection, managed)
  const visibleEndpoints = endpoints ?? []

  const downloadCa = async () => {
    setCaBusy(true)
    setCaError(null)
    setCaMessage(null)
    try {
      await downloadCaBundle()
      setCaMessage(downloadSuccessMessage())
    } catch (err) {
      setCaError(
        err instanceof Error ? err.message : 'Failed to download Organization CA',
      )
    } finally {
      setCaBusy(false)
    }
  }

  return (
    <SectionPanel
      title="Connection"
      hint="Shared proxy listener for this server"
      accent
    >
      <View style={panelStyles.detailCard}>
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Write endpoint: </Text>
          {endpointLabel(managed, connection)}
        </Text>
        {port != null ? (
          <Text style={panelStyles.muted}>
            Protocol port {port} — every managed database on this server shares
            this listener. The endpoint stays the same across failover.
          </Text>
        ) : null}
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Server: </Text>
          {serverLabel(server)}
        </Text>
        <EndpointList endpoints={visibleEndpoints} />
        {connection ? (
          <>
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Read/write login: </Text>
              {connection.username}
            </Text>
            <Text style={panelStyles.muted}>
              The username is how the proxy routes you to this cluster.
            </Text>
            {hasReadEligible ? (
              <ReadOnlyConnectionBlock
                endpoint={`${connection.host}:${connection.port}`}
                logins={readOnlyLogins}
              />
            ) : null}
            <Text style={panelStyles.detailLine}>
              <Text style={panelStyles.detailLabel}>Database: </Text>
              {connection.database}
            </Text>
            <TlsPolicyLines engine={managed.engine} ssl={ssl} />
            <View style={styles.caRow}>
              <Button
                label="Download Organization CA"
                busyLabel="Downloading…"
                busy={caBusy}
                onPress={() => {
                  void downloadCa()
                }}
              />
            </View>
            {overlapping ? (
              <Text style={panelStyles.calloutWarningText}>
                A previous Organization CA generation is still trusted during
                rotation — download the latest bundle to pick up the new root.
              </Text>
            ) : null}
            {caMessage ? (
              <Text style={panelStyles.muted}>{caMessage}</Text>
            ) : null}
            {caError ? (
              <Text style={panelStyles.error}>{caError}</Text>
            ) : null}
            <Text style={panelStyles.detailLabel}>DSN</Text>
            <View style={panelStyles.commandCodeBlock}>
              <Text style={styles.dsn} selectable>
                {connection.dsn}
              </Text>
            </View>
            <CopyButton value={connection.dsn} label="Copy DSN" size="md" />
          </>
        ) : null}
      </View>
      <Text style={[panelStyles.muted, styles.pointer]}>
        Connecting a TurboPanel service? Use Connect to a service — no copying
        required.
      </Text>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  dsn: {
    color: colors.textBody,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  caRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  loginRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  loginChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  loginChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  pointer: {
    marginTop: spacing.sm,
  },
  endpointList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
})
