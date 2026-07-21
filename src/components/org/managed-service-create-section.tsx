import { useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createManagedService,
  fetchOrgServers,
  isForbiddenError,
  type OrgServerRecord,
} from '@/lib/instance-api'
import {
  MANAGED_SERVICE_CATALOG,
  type ManagedServiceEngine,
} from '@/lib/managed-services'
import { orgRouteHref } from '@/lib/org-navigation'
import { colors, spacing } from '@/lib/theme'

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/

export function ManagedServiceCreateSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedEngine] = useState<ManagedServiceEngine>('postgres')
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Production DB')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const engine = useMemo(
    () =>
      MANAGED_SERVICE_CATALOG.find((entry) => entry.engine === selectedEngine),
    [selectedEngine],
  )

  const connectedServers = useMemo(
    () => servers.filter((server) => server.connected),
    [servers],
  )

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
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load servers',
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
  }, [handleUnauthorized])

  const handleProvision = () => {
    const trimmed = displayName.trim()
    if (!selectedServerId) {
      setFieldError('Select a connected server.')
      return
    }
    if (!trimmed) {
      setFieldError('Name is required.')
      return
    }
    if (!DISPLAY_NAME_PATTERN.test(trimmed)) {
      setFieldError('Use letters, numbers, spaces, dots, underscores, or hyphens.')
      return
    }

    setSubmitting(true)
    setFieldError(null)
    void (async () => {
      try {
        const result = await createManagedService({
          engine: selectedEngine,
          serverId: selectedServerId,
          displayName: trimmed,
        })
        router.replace(
          `${orgRouteHref(orgId, 'servers', 'managed')}/${result.managedService.id}` as Href,
        )
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setFieldError(
          err instanceof Error ? err.message : 'Failed to provision service',
        )
      } finally {
        setSubmitting(false)
      }
    })()
  }

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

      <Text style={styles.heading}>Provision {engine?.label ?? 'database'}</Text>

      <SectionPanel title="Target server" hint="Runs on your hardware">
        {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
        {loading ? (
          <Text style={orgPanelStyles.muted}>Loading servers…</Text>
        ) : null}
        {!loading && connectedServers.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No connected servers. Add a server first, then return here.
          </Text>
        ) : null}
        <View style={styles.serverList}>
          {connectedServers.map((server) => {
            const selected = selectedServerId === server.id
            const label =
              server.displayName?.trim() ||
              server.hostname?.trim() ||
              server.id
            return (
              <Pressable
                key={server.id}
                style={[styles.serverCard, selected && styles.serverCardSelected]}
                onPress={() => {
                  setSelectedServerId(server.id)
                  setFieldError(null)
                }}
              >
                <Text style={styles.serverLabel}>{label}</Text>
                <Text style={orgPanelStyles.muted}>Online</Text>
              </Pressable>
            )
          })}
        </View>
      </SectionPanel>

      <SectionPanel title="Service details" hint={engine?.description}>
        <View style={styles.field}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value)
              setFieldError(null)
            }}
            placeholder="Production DB"
            placeholderTextColor={colors.textDim}
            autoCapitalize="words"
            maxLength={255}
          />
        </View>
        {fieldError ? (
          <Text style={styles.fieldError}>{fieldError}</Text>
        ) : null}
        <Pressable
          style={[styles.primaryButton, submitting && styles.buttonDisabled]}
          disabled={submitting}
          onPress={handleProvision}
        >
          <Text style={styles.primaryButtonText}>
            {submitting ? 'Provisioning…' : 'Provision'}
          </Text>
        </Pressable>
      </SectionPanel>
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
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  serverList: {
    gap: spacing.sm,
  },
  serverCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
    gap: 2,
  },
  serverCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  serverLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
