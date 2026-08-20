import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { ManagedSslModePicker } from '@/components/org/managed/managed-ssl-mode-picker'
import {
  fetchOrgManagedDefaults,
  saveOrgManagedDefaults,
  type OrgManagedDefaults,
  type OrgManagedDefaultsPatch,
} from '@/lib/instance-api'
import {
  DEFAULT_MANAGED_SSL_MODE,
  managedSslModeLabel,
  type ManagedSslMode,
} from '@/lib/managed-ssl'
import {
  DEFAULT_MANAGED_INGRESS_PORTS,
  MANAGED_INGRESS_PORT_LABELS,
  managedIngressPortRejectionMessage,
  parseManagedIngressPortInput,
  resolveManagedIngressPorts,
  validateManagedIngressPorts,
  type ManagedIngressPortField,
} from '@/lib/managed-ingress-ports'
import { queryKeys, useApiMutation, useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function useManagedDefaults(
  orgId: string,
  enabled: boolean,
): UseQueryResult<OrgManagedDefaults> {
  return useQuery({
    queryKey: queryKeys.org(orgId).settings.managedDefaults,
    queryFn: () => fetchOrgManagedDefaults(orgId),
    enabled,
  })
}

/**
 * Organization-wide managed-database defaults: client TLS policy and the shared
 * listener ports.
 *
 * Both are inheritance sources rather than applied configuration for TLS, and
 * organization-wide rather than per-service for ports — one ProxySQL fronts every
 * managed cluster on a server, so a per-service port would defeat the shared
 * listener. The two panels write the same endpoint with disjoint patches so
 * saving one never rewrites the other.
 */
export function ManagedDefaultsSettingsSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const query = useManagedDefaults(orgId, canManage)

  if (!canManage) return null

  return (
    <>
      <ManagedTlsDefaultsPanel orgId={orgId} query={query} />
      <ManagedListenerPortsPanel orgId={orgId} query={query} />
    </>
  )
}

function useSaveManagedDefaults(
  orgId: string,
  onFailure: (message: string) => void,
  fallbackMessage: string,
) {
  const queryClient = useQueryClient()
  const queryKey = queryKeys.org(orgId).settings.managedDefaults
  return useApiMutation({
    mutationFn: (patch: OrgManagedDefaultsPatch) =>
      saveOrgManagedDefaults(orgId, patch),
    onSuccess: (data) => {
      queryClient.setQueryData<OrgManagedDefaults>(queryKey, {
        sslMode: data.sslMode,
        effectiveSslMode: data.effectiveSslMode,
        ports: data.ports,
        effectivePorts: data.effectivePorts,
      })
      // Managed detail responses carry the resolved TLS mode and endpoints, so
      // an org default change has to invalidate them, not just this key.
      void queryClient.invalidateQueries({
        queryKey: queryKeys.org(orgId).managed.all,
      })
    },
    onError: (err) => onFailure(errorMessage(err, fallbackMessage)),
  })
}

function ManagedTlsDefaultsPanel({
  orgId,
  query,
}: Readonly<{ orgId: string; query: UseQueryResult<OrgManagedDefaults> }>) {
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ManagedSslMode | null>(null)
  const [touched, setTouched] = useState(false)
  const mutation = useSaveManagedDefaults(
    orgId,
    setError,
    'Failed to save managed database defaults',
  )

  const stored = query.data?.sslMode ?? null
  const selected = touched ? draft : stored
  const pending = mutation.isPending || query.isLoading
  const dirty = touched && selected !== stored

  return (
    <SectionPanel
      title="Managed database TLS"
      hint="Manage-gated · inherited by services with no explicit mode"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {query.isError && !error ? (
        <Text style={orgPanelStyles.error}>
          {errorMessage(query.error, 'Failed to load managed database defaults')}
        </Text>
      ) : null}

      <Text style={orgPanelStyles.muted}>
        Sets how managed SQL clients must connect through the shared listener.
        Traffic between the listener and the database engine is always encrypted;
        this decides whether a plaintext client session is refused, and what
        verification the generated connection strings ask for. Services that set
        their own mode keep it.
      </Text>
      <Text style={orgPanelStyles.muted}>
        Verify CA and Verify Full need the Organization CA, which is downloadable
        from a managed service&apos;s Connect tab.
      </Text>

      <ManagedSslModePicker
        value={selected}
        inheritLabel={`Platform default (${
          managedSslModeLabel(DEFAULT_MANAGED_SSL_MODE)
        })`}
        inheritHint="No organization default stored; new services resolve to Require."
        disabled={pending}
        onSelect={(mode) => {
          setTouched(true)
          setDraft(mode)
          setError(null)
        }}
      />

      <SaveButton
        label="Save TLS default"
        pendingLabel="Saving…"
        pending={mutation.isPending}
        disabled={pending || !dirty}
        onPress={() => {
          setError(null)
          mutation.mutate({ sslMode: selected }, {
            onSuccess: () => {
              setTouched(false)
              setDraft(null)
            },
          })
        }}
      />
    </SectionPanel>
  )
}

type PortDrafts = Record<ManagedIngressPortField, string>

function portsPatchFromDrafts(
  drafts: PortDrafts,
):
  | { ok: true; ports: { postgres: number | null; mysqlFamily: number | null } }
  | { ok: false; field: ManagedIngressPortField; message: string } {
  const parsed: Record<ManagedIngressPortField, number | null> = {
    postgres: null,
    mysqlFamily: null,
  }
  for (const field of ['postgres', 'mysqlFamily'] as const) {
    const result = parseManagedIngressPortInput(drafts[field])
    if (!result.ok) {
      return {
        ok: false,
        field,
        message: managedIngressPortRejectionMessage(result.reason),
      }
    }
    parsed[field] = result.value
  }
  // Collision has to be checked on the resolved pair: overriding one family onto
  // the other's inherited default is still two protocol modules on one port.
  const collision = validateManagedIngressPorts(
    resolveManagedIngressPorts(parsed),
  )
  if (!collision.ok) {
    return {
      ok: false,
      field: collision.field,
      message: managedIngressPortRejectionMessage(collision.reason),
    }
  }
  return { ok: true, ports: parsed }
}

function ManagedListenerPortsPanel({
  orgId,
  query,
}: Readonly<{ orgId: string; query: UseQueryResult<OrgManagedDefaults> }>) {
  const [error, setError] = useState<string | null>(null)
  const [invalidField, setInvalidField] = useState<
    ManagedIngressPortField | null
  >(null)
  const [drafts, setDrafts] = useState<Partial<PortDrafts>>({})
  const mutation = useSaveManagedDefaults(
    orgId,
    setError,
    'Failed to save managed listener ports',
  )

  const stored = query.data?.ports
  const storedText = (field: ManagedIngressPortField): string => {
    const value = stored?.[field]
    return value == null ? '' : String(value)
  }
  const text = (field: ManagedIngressPortField): string =>
    drafts[field] ?? storedText(field)
  const dirty = (['postgres', 'mysqlFamily'] as const).some(
    (field) => text(field) !== storedText(field),
  )
  const pending = mutation.isPending || query.isLoading

  const save = () => {
    const result = portsPatchFromDrafts({
      postgres: text('postgres'),
      mysqlFamily: text('mysqlFamily'),
    })
    if (!result.ok) {
      setInvalidField(result.field)
      setError(`${MANAGED_INGRESS_PORT_LABELS[result.field]}: ${result.message}`)
      return
    }
    setInvalidField(null)
    setError(null)
    mutation.mutate({ ports: result.ports }, {
      onSuccess: () => setDrafts({}),
    })
  }

  return (
    <SectionPanel
      title="Managed database listener ports"
      hint="Manage-gated · applies to every shared listener in this organization"
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      <Text style={orgPanelStyles.muted}>
        Ports clients dial on the shared listener. They are organization-wide
        because one listener fronts every managed database on a server. Engine
        backend ports are untouched, so a host already running its own PostgreSQL
        on 5432 or MySQL on 3306 never conflicts with these.
      </Text>
      <Text style={orgPanelStyles.muted}>
        Saving reconciles the listener on every affected server. A port another
        process on the host already holds is refused before the current listener
        is disturbed.
      </Text>

      {(['postgres', 'mysqlFamily'] as const).map((field) => (
        <View key={field} style={styles.field}>
          <Text style={styles.fieldLabel}>
            {MANAGED_INGRESS_PORT_LABELS[field]}
          </Text>
          <TextInput
            value={text(field)}
            onChangeText={(next) => {
              setDrafts((prev) => ({ ...prev, [field]: next }))
              setInvalidField(null)
              setError(null)
            }}
            editable={!pending}
            keyboardType="number-pad"
            placeholder={String(DEFAULT_MANAGED_INGRESS_PORTS[field])}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={`${
              MANAGED_INGRESS_PORT_LABELS[field]
            } listener port`}
            style={[
              styles.input,
              pending && styles.inputDisabled,
              invalidField === field && styles.inputInvalid,
            ]}
          />
          <Text style={orgPanelStyles.muted}>
            Empty inherits the platform default{' '}
            {DEFAULT_MANAGED_INGRESS_PORTS[field]}.
            {field === 'mysqlFamily' ? ' MariaDB uses this port too.' : ''}
          </Text>
        </View>
      ))}

      <SaveButton
        label="Save listener ports"
        pendingLabel="Applying…"
        pending={mutation.isPending}
        disabled={pending || !dirty}
        onPress={save}
      />
    </SectionPanel>
  )
}

function SaveButton({
  label,
  pendingLabel,
  pending,
  disabled,
  onPress,
}: Readonly<{
  label: string
  pendingLabel: string
  pending: boolean
  disabled: boolean
  onPress: () => void
}>) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        orgPanelStyles.toolbarBtnPrimary,
        disabled && styles.btnDisabled,
        pressed && styles.btnPressed,
        webPointer,
      ]}
    >
      <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
        {pending ? pendingLabel : label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.85,
  },
  field: {
    gap: spacing.xs,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    minHeight: 44,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  inputInvalid: {
    borderColor: colors.error,
  },
})
