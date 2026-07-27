import * as Clipboard from 'expo-clipboard'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import type {
  ManagedConnectionInfo,
  ManagedEnvironmentRecord,
  ManagedServerSummary,
} from '@/lib/managed-services'
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
}: Readonly<{
  managed: ManagedEnvironmentRecord
  connection: ManagedConnectionInfo | null
  server: ManagedServerSummary | null
}>) {
  const [copied, setCopied] = useState(false)

  const copyDsn = async () => {
    if (!connection?.dsn) {
      return
    }
    await Clipboard.setStringAsync(connection.dsn)
    setCopied(true)
  }

  return (
    <SectionPanel title="Connection" hint="Endpoint and credentials for clients" accent>
      <View style={orgPanelStyles.detailCard}>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Endpoint: </Text>
          {endpointLabel(managed, connection)}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Server: </Text>
          {serverLabel(server)}
        </Text>
        {connection ? (
          <>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Host: </Text>
              {connection.host}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Port: </Text>
              {String(connection.port)}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Database: </Text>
              {connection.database}
            </Text>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Username: </Text>
              {connection.username}
            </Text>
            <Text style={orgPanelStyles.detailLabel}>DSN</Text>
            <View style={orgPanelStyles.commandCodeBlock}>
              <Text style={styles.dsn} selectable>
                {connection.dsn}
              </Text>
            </View>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer, styles.copyBtn]}
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
})
