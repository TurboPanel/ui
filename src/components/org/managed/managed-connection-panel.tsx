import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { downloadOrganizationCaPem } from '@/lib/instance-api'
import type {
  ManagedConnectionInfo,
  ManagedEnvironmentRecord,
  ManagedMemberRecord,
  ManagedServerSummary,
  ManagedServiceEngine,
} from '@/lib/managed-services'
import { managedCatalogEntryForCode } from '@/lib/managed-services'
import { hasReadEligibleReplica } from '@/lib/managed-read-endpoint'
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

function protocolPort(engine: ManagedServiceEngine | null): number | null {
  if (!engine) return null
  return managedCatalogEntryForCode(engine)?.defaultPort ?? null
}

function serverLabel(server: ManagedServerSummary | null): string {
  if (!server) {
    return '—'
  }
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

export function ManagedConnectionPanel({
  managed,
  connection,
  server,
  members,
}: Readonly<{
  managed: ManagedEnvironmentRecord
  connection: ManagedConnectionInfo | null
  server: ManagedServerSummary | null
  members?: readonly ManagedMemberRecord[]
}>) {
  const [copied, setCopied] = useState(false)
  const [caBusy, setCaBusy] = useState(false)
  const [caMessage, setCaMessage] = useState<string | null>(null)
  const [caError, setCaError] = useState<string | null>(null)

  const hasReadEligible = hasReadEligibleReplica(members)
  const port = protocolPort(managed.engine)

  const copyDsn = async () => {
    if (!connection?.dsn) {
      return
    }
    await Clipboard.setStringAsync(connection.dsn)
    setCopied(true)
  }

  const downloadCa = async () => {
    setCaBusy(true)
    setCaError(null)
    setCaMessage(null)
    try {
      const pem = await downloadOrganizationCaPem()
      await Clipboard.setStringAsync(pem)
      if (typeof document !== 'undefined') {
        const blob = new Blob([pem], { type: 'application/x-pem-file' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'turbopanel-org-ca.pem'
        anchor.click()
        URL.revokeObjectURL(url)
      }
      setCaMessage('CA certificate copied' + (typeof document !== 'undefined' ? ' and downloaded' : ''))
    } catch (err) {
      setCaError(
        err instanceof Error ? err.message : 'Failed to download CA certificate',
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
      <View style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Write endpoint: </Text>
          {endpointLabel(managed, connection)}
        </Text>
        {port != null ? (
          <Text style={orgPanelStyles.muted}>
            Protocol port {port} — every managed database on this server shares
            this listener.
          </Text>
        ) : null}
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Server: </Text>
          {serverLabel(server)}
        </Text>
        {connection ? (
          <>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Login: </Text>
              {connection.username}
            </Text>
            <Text style={orgPanelStyles.muted}>
              The username is how the proxy routes you to this cluster.
            </Text>
            {hasReadEligible ? (
              <>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Read endpoint: </Text>
                  {connection.host}:{connection.port}
                </Text>
                <Text style={orgPanelStyles.muted}>
                  Same host and port — reads may be served by a replica when
                  eligible members are online.
                </Text>
              </>
            ) : null}
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Database: </Text>
              {connection.database}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>TLS: </Text>
              sslmode=verify-full (required)
            </Text>
            <View style={styles.caRow}>
              <Pressable
                style={[
                  orgPanelStyles.toolbarBtnSecondary,
                  webPointer,
                  caBusy && styles.disabled,
                ]}
                disabled={caBusy}
                onPress={() => {
                  void downloadCa()
                }}
              >
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                  {caBusy ? 'Downloading…' : 'Download CA certificate'}
                </Text>
              </Pressable>
            </View>
            {caMessage ? (
              <Text style={orgPanelStyles.muted}>{caMessage}</Text>
            ) : null}
            {caError ? (
              <Text style={orgPanelStyles.error}>{caError}</Text>
            ) : null}
            <Text style={orgPanelStyles.detailLabel}>DSN</Text>
            <View style={orgPanelStyles.commandCodeBlock}>
              <Text style={styles.dsn} selectable>
                {connection.dsn}
              </Text>
            </View>
            <Pressable
              style={[
                orgPanelStyles.toolbarBtnSecondary,
                webPointer,
                styles.copyBtn,
              ]}
              onPress={() => {
                void copyDsn()
              }}
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                {copied ? 'Copied' : 'Copy DSN'}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>
      <Text style={[orgPanelStyles.muted, styles.pointer]}>
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
  copyBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  caRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  pointer: {
    marginTop: spacing.sm,
  },
  disabled: {
    opacity: 0.55,
  },
})
