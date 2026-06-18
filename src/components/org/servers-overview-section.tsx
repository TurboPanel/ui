import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchOrgServers,
  isForbiddenError,
  type OrgServerRecord,
} from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

function serverTitle(server: OrgServerRecord): string {
  return server.displayName?.trim() || server.hostname?.trim() || server.id
}

export function ServersOverviewSection({ orgId }: { orgId: string }) {
  const { handleUnauthorized } = useAuth()
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchOrgServers()
        if (!cancelled) {
          setServers(result.servers)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            setError(
              err instanceof Error ? err.message : 'Access to servers was denied',
            )
          } else {
            setError(err instanceof Error ? err.message : 'Failed to load servers')
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    const timer = setInterval(() => void load(), 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [orgId, handleUnauthorized])

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Servers overview</Text>
      <Text style={styles.copy}>
        Hosts assigned to your organization. Connection status refreshes every few
        seconds.
      </Text>

      <SectionPanel title="Your servers" hint={`Organization ${orgId}`}>
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading && servers.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Loading…</Text>
        ) : servers.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No servers are assigned to this organization yet.
          </Text>
        ) : (
          <View style={styles.list}>
            {servers.map((server) => (
              <View key={server.id} style={orgPanelStyles.detailCard}>
                <View style={styles.cardHeader}>
                  <Text style={orgPanelStyles.detailTitle}>
                    {serverTitle(server)}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      server.connected
                        ? styles.statusOnline
                        : styles.statusOffline,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        server.connected
                          ? styles.statusTextOnline
                          : styles.statusTextOffline,
                      ]}
                    >
                      {server.connected ? 'Online' : 'Offline'}
                    </Text>
                  </View>
                </View>
                {server.hostname && server.displayName ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Hostname: </Text>
                    {server.hostname}
                  </Text>
                ) : null}
                {server.connected && server.remoteAddress ? (
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Connecting IP: </Text>
                    <Text selectable>{server.remoteAddress}</Text>
                  </Text>
                ) : null}
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>ID: </Text>
                  <Text selectable>{server.id}</Text>
                </Text>
                <Text style={orgPanelStyles.detailLine}>
                  <Text style={orgPanelStyles.detailLabel}>Added: </Text>
                  {new Date(server.createdAt).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
  },
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusOnline: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  statusOffline: {
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusTextOnline: {
    color: colors.accent,
  },
  statusTextOffline: {
    color: colors.textDim,
  },
})
