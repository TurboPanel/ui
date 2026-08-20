import { useMemo, useState } from 'react'
import { useRouter, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import {
  DEFAULT_BINDING_KEY_PREFIX,
  previewBindingKeys,
  validateBindingKeyPrefix,
} from '@/lib/bindings'
import {
  BINDING_ENDPOINT_UNAVAILABLE_ERROR,
  type BindingRecord,
  type EnvironmentRecord,
} from '@/lib/instance-api'
import type {
  ManagedServiceEngine,
  ManagedUserRecord,
} from '@/lib/managed-services'
import { managedErrorMessage } from '@/lib/managed-services'
import { projectServiceHref } from '@/lib/project-navigation'
import { orEmptyArray } from '@/lib/or-empty-array'
import {
  useCreateBinding,
  useDeleteBinding,
  useManagedEnvironmentBindings,
} from '@/lib/queries/bindings'
import { useEnvironments } from '@/lib/queries/environments'
import { useServices } from '@/lib/queries/services'
import { chrome, colors, spacing } from '@/lib/theme'

const webInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
  borderRadius: 6,
  minHeight: 44,
} as const

type ServiceMeta = { name: string; projectId: string }

type ConnectBindingFields = {
  serviceId: string
  principalId: string
  databaseName: string
  keyPrefix: string
  emitEngineDefaults: boolean
}

/**
 * A read-only login cannot write, so binding it to a service that expects to
 * write is a footgun worth labeling wherever the credential is chosen or shown.
 */
function managedUserPickerLabel(user: ManagedUserRecord): string {
  return user.connectionRole === 'read-only'
    ? `${user.username} (read-only)`
    : user.username
}

function KeyChip({ label }: Readonly<{ label: string }>) {
  return (
    <View style={styles.keyChip}>
      <Text style={styles.keyChipText}>{label}</Text>
    </View>
  )
}

function extractErrorCode(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  const match = /HTTP \d+:\s*([a-z0-9_]+)/i.exec(err.message)
  return match?.[1] ?? null
}

function ChipSelectRow<T>({
  items,
  getId,
  getLabel,
  selectedId,
  onSelect,
}: Readonly<{
  items: readonly T[]
  getId: (item: T) => string
  getLabel: (item: T) => string
  selectedId: string
  onSelect: (id: string) => void
}>) {
  return (
    <View style={styles.chipRow}>
      {items.map((item) => {
        const id = getId(item)
        const selected = selectedId === id
        return (
          <Pressable
            key={id}
            style={[styles.chip, selected && styles.chipSelected, webPointer]}
            onPress={() => onSelect(id)}
          >
            <Text
              style={[styles.chipText, selected && styles.chipTextSelected]}
            >
              {getLabel(item)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function BindingDisconnectAction({
  disabled,
  armed,
  onArm,
  onDisarm,
  onConfirm,
}: Readonly<{
  disabled: boolean
  armed: boolean
  onArm: () => void
  onDisarm: () => void
  onConfirm: () => void
}>) {
  if (armed) {
    return (
      <>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          disabled={disabled}
          onPress={onConfirm}
        >
          <Text
            style={[orgPanelStyles.toolbarBtnTextSecondary, styles.danger]}
          >
            Confirm disconnect
          </Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onDisarm}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </>
    )
  }

  return (
    <Pressable
      style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
      disabled={disabled}
      onPress={onArm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Disconnect</Text>
    </Pressable>
  )
}

function BindingCard({
  binding,
  meta,
  user,
  canManage,
  disabled,
  disconnectArmedId,
  onOpenService,
  onArmDisconnect,
  onDisarmDisconnect,
  onDisconnect,
}: Readonly<{
  binding: BindingRecord
  meta: ServiceMeta | undefined
  user: ManagedUserRecord | undefined
  canManage: boolean
  disabled: boolean
  disconnectArmedId: string | null
  onOpenService: (projectId: string, serviceId: string) => void
  onArmDisconnect: (id: string) => void
  onDisarmDisconnect: () => void
  onDisconnect: (binding: BindingRecord) => void
}>) {
  const endpoint = binding.endpoint
    ? `${binding.endpoint.host}:${binding.endpoint.port}`
    : '—'

  return (
    <View style={styles.card}>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Database: </Text>
        {binding.databaseName}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>User: </Text>
        {user ? managedUserPickerLabel(user) : binding.principalId}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Prefix: </Text>
        {binding.keyPrefix}
      </Text>
      {binding.emitEngineDefaults ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>Engine defaults</Text>
        </View>
      ) : null}
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Endpoint: </Text>
        {endpoint}
      </Text>
      <Text style={orgPanelStyles.muted}>
        {
          "Points at this server's database ingress and does not move when the primary changes."
        }
      </Text>
      <View style={styles.keyRow}>
        {binding.keys.map((key) => (
          <KeyChip key={key} label={key} />
        ))}
      </View>
      <View style={styles.actions}>
        {meta?.projectId ? (
          <Pressable
            style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
            onPress={() => onOpenService(meta.projectId, binding.serviceId)}
          >
            <Text style={orgPanelStyles.toolbarBtnTextSecondary}>
              Open service
            </Text>
          </Pressable>
        ) : null}
        {canManage ? (
          <BindingDisconnectAction
            disabled={disabled}
            armed={disconnectArmedId === binding.id}
            onArm={() => onArmDisconnect(binding.id)}
            onDisarm={onDisarmDisconnect}
            onConfirm={() => onDisconnect(binding)}
          />
        ) : null}
      </View>
    </View>
  )
}

function ServiceBindingGroup({
  title,
  rows,
  meta,
  userById,
  canManage,
  disabled,
  disconnectArmedId,
  onOpenService,
  onArmDisconnect,
  onDisarmDisconnect,
  onDisconnect,
}: Readonly<{
  title: string
  rows: BindingRecord[]
  meta: ServiceMeta | undefined
  userById: Map<string, ManagedUserRecord>
  canManage: boolean
  disabled: boolean
  disconnectArmedId: string | null
  onOpenService: (projectId: string, serviceId: string) => void
  onArmDisconnect: (id: string) => void
  onDisarmDisconnect: () => void
  onDisconnect: (binding: BindingRecord) => void
}>) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {rows.map((binding) => (
        <BindingCard
          key={binding.id}
          binding={binding}
          meta={meta}
          user={userById.get(binding.principalId)}
          canManage={canManage}
          disabled={disabled}
          disconnectArmedId={disconnectArmedId}
          onOpenService={onOpenService}
          onArmDisconnect={onArmDisconnect}
          onDisarmDisconnect={onDisarmDisconnect}
          onDisconnect={onDisconnect}
        />
      ))}
    </View>
  )
}

function ConnectServiceForm({
  orgId,
  environmentId,
  engine,
  environments,
  users,
  databases,
  disabled,
  onSubmit,
  onCancel,
}: Readonly<{
  orgId: string
  environmentId: string
  engine: ManagedServiceEngine | null
  environments: EnvironmentRecord[]
  users: ManagedUserRecord[]
  databases: string[]
  disabled: boolean
  onSubmit: (fields: ConnectBindingFields) => void
  onCancel: () => void
}>) {
  const [targetEnvironmentId, setTargetEnvironmentId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [principalId, setPrincipalId] = useState('')
  const [databaseName, setDatabaseName] = useState('')
  const [keyPrefix, setKeyPrefix] = useState(DEFAULT_BINDING_KEY_PREFIX)
  const [emitEngineDefaults, setEmitEngineDefaults] = useState(true)

  const servicesForEnvQuery = useServices(
    orgId,
    targetEnvironmentId || undefined,
    { enabled: Boolean(targetEnvironmentId) },
  )
  const envServices = servicesForEnvQuery.data?.services ?? []
  const otherEnvironments = environments.filter(
    (env) => env.id !== environmentId,
  )

  const prefixValidation = validateBindingKeyPrefix(keyPrefix)
  const previewKeys =
    engine && prefixValidation.ok
      ? previewBindingKeys({
          prefix: prefixValidation.prefix,
          engine,
          emitEngineDefaults,
        })
      : []

  return (
    <View style={styles.form}>
      <Text style={orgPanelStyles.detailTitle}>Connect to a service</Text>
      <Text style={orgPanelStyles.detailLabel}>Environment</Text>
      <ChipSelectRow
        items={otherEnvironments}
        getId={(env) => env.id}
        getLabel={(env) => env.name?.trim() || 'Environment'}
        selectedId={targetEnvironmentId}
        onSelect={(id) => {
          setTargetEnvironmentId(id)
          setServiceId('')
        }}
      />

      {targetEnvironmentId ? (
        <>
          <Text style={orgPanelStyles.detailLabel}>Service</Text>
          <ChipSelectRow
            items={envServices}
            getId={(service) => service.id}
            getLabel={(service) =>
              service.name?.trim() ||
              service.composeServiceName ||
              service.id
            }
            selectedId={serviceId}
            onSelect={setServiceId}
          />
        </>
      ) : null}

      <Text style={orgPanelStyles.detailLabel}>User</Text>
      <ChipSelectRow
        items={users}
        getId={(user) => user.id}
        getLabel={(user) => managedUserPickerLabel(user)}
        selectedId={principalId}
        onSelect={setPrincipalId}
      />

      <Text style={orgPanelStyles.detailLabel}>Database</Text>
      <ChipSelectRow
        items={databases}
        getId={(name) => name}
        getLabel={(name) => name}
        selectedId={databaseName}
        onSelect={setDatabaseName}
      />

      <Text style={orgPanelStyles.detailLabel}>Key prefix</Text>
      <TextInput
        style={Platform.OS === 'web' ? webInputStyle : styles.input}
        value={keyPrefix}
        onChangeText={setKeyPrefix}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!disabled}
      />
      {!prefixValidation.ok ? (
        <Text style={orgPanelStyles.error}>{prefixValidation.error}</Text>
      ) : null}

      <Pressable
        style={[styles.toggleRow, webPointer]}
        onPress={() => setEmitEngineDefaults((v) => !v)}
        disabled={disabled}
      >
        <View
          style={[
            styles.checkbox,
            emitEngineDefaults && styles.checkboxChecked,
          ]}
        >
          {emitEngineDefaults ? (
            <Text style={styles.checkboxMark}>✓</Text>
          ) : null}
        </View>
        <Text style={styles.toggleLabel}>Also set engine defaults</Text>
      </Pressable>

      {previewKeys.length > 0 ? (
        <View style={styles.keyRow}>
          {previewKeys.map((key) => (
            <KeyChip key={key} label={key} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          style={[
            orgPanelStyles.toolbarBtnPrimary,
            webPointer,
            disabled && styles.disabled,
          ]}
          disabled={disabled}
          onPress={() =>
            onSubmit({
              serviceId,
              principalId,
              databaseName,
              keyPrefix,
              emitEngineDefaults,
            })
          }
        >
          <Text style={orgPanelStyles.toolbarBtnTextPrimary}>Connect</Text>
        </Pressable>
        <Pressable
          style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
          onPress={onCancel}
        >
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function ConnectServiceSection({
  canManage,
  showForm,
  disabled,
  formProps,
  onShowForm,
}: Readonly<{
  canManage: boolean
  showForm: boolean
  disabled: boolean
  formProps: Omit<
    Parameters<typeof ConnectServiceForm>[0],
    'disabled'
  >
  onShowForm: () => void
}>) {
  if (!canManage) return null

  if (showForm) {
    return <ConnectServiceForm {...formProps} disabled={disabled} />
  }

  return (
    <Pressable
      style={[
        orgPanelStyles.toolbarBtnPrimary,
        webPointer,
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onShowForm}
    >
      <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
        Connect to a service
      </Text>
    </Pressable>
  )
}

export function ManagedBindingsPanel({
  orgId,
  environmentId,
  engine,
  users,
  databases,
  canManage,
  busy,
}: Readonly<{
  orgId: string
  environmentId: string
  engine: ManagedServiceEngine | null
  users: ManagedUserRecord[]
  databases: string[]
  canManage: boolean
  busy: boolean
}>) {
  const router = useRouter()
  const bindingsQuery = useManagedEnvironmentBindings(orgId, environmentId)
  const environmentsQuery = useEnvironments(orgId)
  const allServicesQuery = useServices(orgId)
  const createBinding = useCreateBinding(orgId)
  const deleteBinding = useDeleteBinding(orgId)

  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endpointUnavailable, setEndpointUnavailable] = useState(false)
  const [working, setWorking] = useState(false)
  const [disconnectArmedId, setDisconnectArmedId] = useState<string | null>(
    null,
  )

  const bindings = orEmptyArray(bindingsQuery.data?.bindings)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const envProjectById = useMemo(() => {
    const map = new Map<string, string>()
    for (const env of environments) {
      map.set(env.id, env.projectId)
    }
    return map
  }, [environments])

  const serviceMetaById = useMemo(() => {
    const map = new Map<string, ServiceMeta>()
    for (const service of allServicesQuery.data?.services ?? []) {
      map.set(service.id, {
        name:
          service.name?.trim() ||
          service.composeServiceName ||
          service.id,
        projectId: envProjectById.get(service.environmentId) ?? '',
      })
    }
    return map
  }, [allServicesQuery.data, envProjectById])

  const userById = useMemo(
    () => new Map(users.map((u) => [u.id, u])),
    [users],
  )

  const byService = useMemo(() => {
    const groups = new Map<string, BindingRecord[]>()
    for (const binding of bindings) {
      const list = groups.get(binding.serviceId) ?? []
      list.push(binding)
      groups.set(binding.serviceId, list)
    }
    return [...groups.entries()].sort((a, b) => {
      const an = serviceMetaById.get(a[0])?.name ?? a[0]
      const bn = serviceMetaById.get(b[0])?.name ?? b[0]
      return an.localeCompare(bn)
    })
  }, [bindings, serviceMetaById])

  const handleCreate = async (fields: ConnectBindingFields) => {
    if (!fields.principalId || !fields.serviceId || !fields.databaseName.trim()) {
      setError('Choose a service, user, and database.')
      return
    }
    const prefixValidation = validateBindingKeyPrefix(fields.keyPrefix)
    if (!prefixValidation.ok) {
      setError(prefixValidation.error)
      return
    }
    setWorking(true)
    setError(null)
    setEndpointUnavailable(false)
    try {
      await createBinding.mutateAsync({
        principalId: fields.principalId,
        serviceId: fields.serviceId,
        databaseName: fields.databaseName.trim(),
        keyPrefix: prefixValidation.prefix,
        emitEngineDefaults: fields.emitEngineDefaults,
        managedEnvironmentId: environmentId,
      })
      setShowForm(false)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to connect service'))
      setEndpointUnavailable(
        extractErrorCode(err) === BINDING_ENDPOINT_UNAVAILABLE_ERROR,
      )
    } finally {
      setWorking(false)
    }
  }

  const handleDisconnect = async (binding: BindingRecord) => {
    setWorking(true)
    setError(null)
    try {
      await deleteBinding.mutateAsync({
        id: binding.id,
        serviceId: binding.serviceId,
        managedEnvironmentId: environmentId,
      })
      setDisconnectArmedId(null)
    } catch (err) {
      setError(managedErrorMessage(err, 'Failed to disconnect'))
      setDisconnectArmedId(null)
    } finally {
      setWorking(false)
    }
  }

  const handleOpenService = (projectId: string, serviceId: string) => {
    router.push(projectServiceHref(orgId, projectId, serviceId) as Href)
  }

  const disabled = busy || working || !canManage

  return (
    <SectionPanel
      title="Connected services"
      hint="Bindings deliver credentials on deploy — the host and port point at this server's database ingress and stay put when the primary changes. Passwords are never shown here"
      accent
    >
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {endpointUnavailable ? (
        <Pressable
          style={webPointer}
          onPress={() => router.push(`/${orgId}/network` as Href)}
        >
          <Text style={styles.linkText}>Open Network</Text>
        </Pressable>
      ) : null}

      <View style={styles.list}>
        {byService.map(([svcId, rows]) => {
          const meta = serviceMetaById.get(svcId)
          return (
            <ServiceBindingGroup
              key={svcId}
              title={meta?.name ?? svcId}
              rows={rows}
              meta={meta}
              userById={userById}
              canManage={canManage}
              disabled={disabled}
              disconnectArmedId={disconnectArmedId}
              onOpenService={handleOpenService}
              onArmDisconnect={setDisconnectArmedId}
              onDisarmDisconnect={() => setDisconnectArmedId(null)}
              onDisconnect={handleDisconnect}
            />
          )
        })}
        {bindings.length === 0 ? (
          <Text style={orgPanelStyles.muted}>
            No services connected yet. Credentials are delivered on deploy when
            you connect a service — the password is never shown here.
          </Text>
        ) : null}
      </View>

      <ConnectServiceSection
        canManage={canManage}
        showForm={showForm}
        disabled={disabled}
        onShowForm={() => setShowForm(true)}
        formProps={{
          orgId,
          environmentId,
          engine,
          environments,
          users,
          databases,
          onSubmit: (fields) => {
            void handleCreate(fields)
          },
          onCancel: () => setShowForm(false),
        }}
      />
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.sm,
  },
  groupTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  keyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  keyChip: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  keyChipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipSelected: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: chrome.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
    minHeight: 44,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  checkboxMark: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  danger: {
    color: colors.error,
  },
  disabled: {
    opacity: 0.55,
  },
  linkText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
})
