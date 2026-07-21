import { useRouter, type Href } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchManagedService,
  isForbiddenError,
  type ManagedServiceRecord,
} from '@/lib/instance-api'
import { MANAGED_SERVICE_CATALOG } from '@/lib/managed-services'
import { orgRouteHref } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

export function ManagedServiceDetailSection({
  orgId,
  managedServiceId,
}: Readonly<{ orgId: string; managedServiceId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const [service, setService] = useState<ManagedServiceRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchManagedService(managedServiceId)
        if (!cancelled) {
          setService(result.managedService)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load managed service',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [handleUnauthorized, managedServiceId])

  const engineLabel =
    MANAGED_SERVICE_CATALOG.find((entry) => entry.engine === service?.engine)
      ?.label ?? service?.engine

  const connectionHint =
    service?.host && service.port
      ? `${service.host}:${service.port}`
      : 'Connection details pending daemon install'

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.backButton}
        onPress={() =>
          router.push(orgRouteHref(orgId, 'servers', 'managed') as Href)
        }
      >
        <Text style={styles.backButtonText}>← Managed services</Text>
      </Pressable>

      <Text style={orgPanelStyles.pageTitle}>
        {service?.displayName?.trim() || engineLabel || 'Managed service'}
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {loading ? <Text style={orgPanelStyles.muted}>Loading…</Text> : null}

      {service ? (
        <>
          <SectionPanel title="Connection" hint={engineLabel ?? 'Database'} accent>
            <Text style={orgPanelStyles.detailLine}>
              <Text style={orgPanelStyles.detailLabel}>Endpoint </Text>
              {connectionHint}
            </Text>
            <Text style={orgPanelStyles.muted}>
              Root credentials are sealed — delivery via variables in a later phase.
            </Text>
          </SectionPanel>

          <SectionPanel title="Operations" hint="Coming soon">
            <View style={styles.actionRow}>
              <Pressable style={[orgPanelStyles.toolbarBtnSecondary, styles.disabled]}>
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                  Move server
                </Text>
              </Pressable>
              <Pressable style={[orgPanelStyles.toolbarBtnSecondary, styles.disabled]}>
                <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
                  Add read replica
                </Text>
              </Pressable>
            </View>
            <Text style={orgPanelStyles.muted}>
              Org VPC (WireGuard) and replica orchestration ship in a later phase.
            </Text>
          </SectionPanel>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backButtonText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  disabled: {
    opacity: 0.5,
  },
})
