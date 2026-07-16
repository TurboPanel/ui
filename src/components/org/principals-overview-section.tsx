import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createPrincipal,
  deletePrincipal,
  fetchPrincipals,
  fetchVisibleServices,
  isForbiddenError,
  setPrincipalPassword,
  updatePrincipal,
  type CreatePrincipalBody,
  type PrincipalKind,
  type PrincipalMetadata,
  type PrincipalProvider,
  type PrincipalRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const PRINCIPAL_KINDS: PrincipalKind[] = ['system', 'database']
const PRINCIPAL_PROVIDERS: PrincipalProvider[] = [
  'pam',
  'postgres',
  'mysql',
  'redis',
]

type PrincipalFormState = {
  kind: PrincipalKind
  provider: PrincipalProvider
  username: string
  uid: string
  gid: string
  home: string
  serviceIds: string[]
}

const EMPTY_FORM: PrincipalFormState = {
  kind: 'system',
  provider: 'pam',
  username: '',
  uid: '',
  gid: '',
  home: '',
  serviceIds: [],
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

function buildMetadata(form: PrincipalFormState): PrincipalMetadata | undefined {
  const uid = parseOptionalInt(form.uid)
  const gid = parseOptionalInt(form.gid)
  const home = form.home.trim() || undefined
  if (uid === undefined && gid === undefined && home === undefined) {
    return undefined
  }
  return {
    ...(uid === undefined ? {} : { uid }),
    ...(gid === undefined ? {} : { gid }),
    ...(home === undefined ? {} : { home }),
  }
}

function formFromPrincipal(row: PrincipalRecord): PrincipalFormState {
  return {
    kind: row.kind,
    provider: row.provider,
    username: row.username,
    uid: row.metadata?.uid === undefined ? '' : String(row.metadata.uid),
    gid: row.metadata?.gid === undefined ? '' : String(row.metadata.gid),
    home: row.metadata?.home ?? '',
    serviceIds: [...row.serviceIds],
  }
}

function formatMetadata(row: PrincipalRecord): string {
  const parts: string[] = []
  if (row.metadata?.uid !== undefined) parts.push(`uid ${row.metadata.uid}`)
  if (row.metadata?.gid !== undefined) parts.push(`gid ${row.metadata.gid}`)
  if (row.metadata?.home) parts.push(row.metadata.home)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function serviceLabel(
  serviceId: string,
  servicesById: ReadonlyMap<string, ServiceRecord>,
): string {
  const service = servicesById.get(serviceId)
  return service?.displayName?.trim() || serviceId
}

function formatServiceSummary(
  row: PrincipalRecord,
  servicesById: ReadonlyMap<string, ServiceRecord>,
): string {
  const count = row.serviceIds.length
  if (count === 0) return '0 services'
  const names = row.serviceIds
    .map((id) => serviceLabel(id, servicesById))
    .slice(0, 3)
  const suffix = count > 3 ? ` +${count - 3} more` : ''
  return `${count} service${count === 1 ? '' : 's'}: ${names.join(', ')}${suffix}`
}

function ChipRow<T extends string>({
  values,
  selected,
  onSelect,
}: Readonly<{
  values: readonly T[]
  selected: T
  onSelect: (value: T) => void
}>) {
  return (
    <View style={styles.chipRow}>
      {values.map((value) => {
        const active = selected === value
        return (
          <Pressable
            key={value}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(value)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {value}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function ServicePicker({
  services,
  selectedIds,
  onToggle,
}: Readonly<{
  services: ServiceRecord[]
  selectedIds: readonly string[]
  onToggle: (serviceId: string) => void
}>) {
  if (services.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No services available. Create a service in a project environment first.
      </Text>
    )
  }

  const selected = new Set(selectedIds)
  return (
    <ScrollView style={styles.pickerList} nestedScrollEnabled>
      {services.map((service) => {
        const isSelected = selected.has(service.id)
        const label = service.displayName?.trim() || service.id
        return (
          <Pressable
            key={service.id}
            style={[styles.pickerRow, isSelected && styles.pickerRowSelected]}
            onPress={() => onToggle(service.id)}
          >
            <Text style={styles.pickerTitle}>{label}</Text>
            <Text style={styles.pickerMeta}>{service.id}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function PrincipalFormFields({
  form,
  services,
  onChange,
}: Readonly<{
  form: PrincipalFormState
  services: ServiceRecord[]
  onChange: (next: PrincipalFormState) => void
}>) {
  const toggleService = (serviceId: string) => {
    const nextIds = form.serviceIds.includes(serviceId)
      ? form.serviceIds.filter((id) => id !== serviceId)
      : [...form.serviceIds, serviceId].sort((a, b) => a.localeCompare(b))
    onChange({ ...form, serviceIds: nextIds })
  }

  return (
    <View style={styles.formFields}>
      <Text style={styles.label}>Kind</Text>
      <ChipRow
        values={PRINCIPAL_KINDS}
        selected={form.kind}
        onSelect={(kind) => onChange({ ...form, kind })}
      />
      <Text style={styles.label}>Provider</Text>
      <ChipRow
        values={PRINCIPAL_PROVIDERS}
        selected={form.provider}
        onSelect={(provider) => onChange({ ...form, provider })}
      />
      <Text style={styles.label}>Username</Text>
      <TextInput
        value={form.username}
        onChangeText={(username) => onChange({ ...form, username })}
        placeholder="account name"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Text style={styles.label}>UID (optional)</Text>
      <TextInput
        value={form.uid}
        onChangeText={(uid) => onChange({ ...form, uid })}
        placeholder="e.g. 1000"
        placeholderTextColor={colors.textDim}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Text style={styles.label}>GID (optional)</Text>
      <TextInput
        value={form.gid}
        onChangeText={(gid) => onChange({ ...form, gid })}
        placeholder="e.g. 1000"
        placeholderTextColor={colors.textDim}
        keyboardType="number-pad"
        style={styles.input}
      />
      <Text style={styles.label}>Home (optional)</Text>
      <TextInput
        value={form.home}
        onChangeText={(home) => onChange({ ...form, home })}
        placeholder="/home/user"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />
      <Text style={styles.label}>Services (at least one)</Text>
      <ServicePicker
        services={services}
        selectedIds={form.serviceIds}
        onToggle={toggleService}
      />
    </View>
  )
}

function DeleteControls({
  confirming,
  deleting,
  onRequestConfirm,
  onCancelConfirm,
  onConfirmDelete,
}: Readonly<{
  confirming: boolean
  deleting: boolean
  onRequestConfirm: () => void
  onCancelConfirm: () => void
  onConfirmDelete: () => void
}>) {
  if (deleting) {
    return <Text style={orgPanelStyles.muted}>Deleting…</Text>
  }
  if (confirming) {
    return (
      <View style={styles.confirmRow}>
        <Text style={orgPanelStyles.muted}>
          Permanently delete this principal?
        </Text>
        <Pressable style={styles.dangerButton} onPress={onConfirmDelete}>
          <Text style={styles.dangerButtonText}>Confirm delete</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancelConfirm}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <Pressable style={styles.dangerButton} onPress={onRequestConfirm}>
      <Text style={styles.dangerButtonText}>Delete</Text>
    </Pressable>
  )
}

function PrincipalOwnerActions({
  confirmingDelete,
  deleting,
  onStartEdit,
  onStartPassword,
  onRequestDeleteConfirm,
  onCancelDeleteConfirm,
  onConfirmDelete,
}: Readonly<{
  confirmingDelete: boolean
  deleting: boolean
  onStartEdit: () => void
  onStartPassword: () => void
  onRequestDeleteConfirm: () => void
  onCancelDeleteConfirm: () => void
  onConfirmDelete: () => void
}>) {
  if (confirmingDelete || deleting) {
    return (
      <View style={styles.actionRow}>
        <DeleteControls
          confirming={confirmingDelete}
          deleting={deleting}
          onRequestConfirm={onRequestDeleteConfirm}
          onCancelConfirm={onCancelDeleteConfirm}
          onConfirmDelete={onConfirmDelete}
        />
      </View>
    )
  }

  return (
    <View style={styles.actionRow}>
      <Pressable style={styles.secondaryButton} onPress={onStartEdit}>
        <Text style={styles.secondaryButtonText}>Edit</Text>
      </Pressable>
      <Pressable style={styles.secondaryButton} onPress={onStartPassword}>
        <Text style={styles.secondaryButtonText}>Set password</Text>
      </Pressable>
      <DeleteControls
        confirming={false}
        deleting={false}
        onRequestConfirm={onRequestDeleteConfirm}
        onCancelConfirm={onCancelDeleteConfirm}
        onConfirmDelete={onConfirmDelete}
      />
    </View>
  )
}

function PasswordForm({
  password,
  saving,
  onChange,
  onSave,
  onCancel,
}: Readonly<{
  password: string
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <Text style={styles.label}>New password (write-only)</Text>
      <TextInput
        value={password}
        onChangeText={onChange}
        placeholder="Enter new password"
        placeholderTextColor={colors.textDim}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
        style={styles.input}
      />
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          disabled={saving || password.length === 0}
          onPress={onSave}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving…' : 'Save password'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function PrincipalCard({
  row,
  servicesById,
  services,
  canOwn,
  editing,
  editForm,
  editSaving,
  passwordOpen,
  passwordValue,
  passwordSaving,
  confirmingDelete,
  deleting,
  onStartEdit,
  onCancelEdit,
  onEditFormChange,
  onSaveEdit,
  onStartPassword,
  onCancelPassword,
  onPasswordChange,
  onSavePassword,
  onRequestDeleteConfirm,
  onCancelDeleteConfirm,
  onConfirmDelete,
}: Readonly<{
  row: PrincipalRecord
  servicesById: ReadonlyMap<string, ServiceRecord>
  services: ServiceRecord[]
  canOwn: boolean
  editing: boolean
  editForm: PrincipalFormState | null
  editSaving: boolean
  passwordOpen: boolean
  passwordValue: string
  passwordSaving: boolean
  confirmingDelete: boolean
  deleting: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onEditFormChange: (next: PrincipalFormState) => void
  onSaveEdit: () => void
  onStartPassword: () => void
  onCancelPassword: () => void
  onPasswordChange: (value: string) => void
  onSavePassword: () => void
  onRequestDeleteConfirm: () => void
  onCancelDeleteConfirm: () => void
  onConfirmDelete: () => void
}>) {
  let body: ReactNode
  if (editing && editForm) {
    body = (
      <View style={styles.inlineForm}>
        <PrincipalFormFields
          form={editForm}
          services={services}
          onChange={onEditFormChange}
        />
        <View style={styles.actionRow}>
          <Pressable
            style={[styles.primaryButton, editSaving && styles.buttonDisabled]}
            disabled={editSaving}
            onPress={onSaveEdit}
          >
            <Text style={styles.primaryButtonText}>
              {editSaving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onCancelEdit}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    )
  } else if (passwordOpen) {
    body = (
      <PasswordForm
        password={passwordValue}
        saving={passwordSaving}
        onChange={onPasswordChange}
        onSave={onSavePassword}
        onCancel={onCancelPassword}
      />
    )
  } else {
    body = (
      <>
        <Text style={orgPanelStyles.muted}>
          {row.kind} · {row.provider}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Metadata: </Text>
          {formatMetadata(row)}
        </Text>
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Services: </Text>
          {formatServiceSummary(row, servicesById)}
        </Text>
        {canOwn ? (
          <PrincipalOwnerActions
            confirmingDelete={confirmingDelete}
            deleting={deleting}
            onStartEdit={onStartEdit}
            onStartPassword={onStartPassword}
            onRequestDeleteConfirm={onRequestDeleteConfirm}
            onCancelDeleteConfirm={onCancelDeleteConfirm}
            onConfirmDelete={onConfirmDelete}
          />
        ) : null}
      </>
    )
  }

  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{row.username}</Text>
      {body}
    </View>
  )
}

export function PrincipalsOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')

  const [rows, setRows] = useState<PrincipalRecord[]>([])
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState<PrincipalFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<PrincipalFormState | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [passwordId, setPasswordId] = useState<string | null>(null)
  const [passwordValue, setPasswordValue] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const servicesById = new Map(services.map((service) => [service.id, service]))

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [principalsResult, servicesResult] = await Promise.all([
        fetchPrincipals(),
        fetchVisibleServices(),
      ])
      setRows(principalsResult.principals)
      setServices(servicesResult.services)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(errorMessage(err, 'Failed to load principals'))
    } finally {
      setLoading(false)
    }
  }, [handleUnauthorized])

  useEffect(() => {
    reload().catch(() => {
      // Errors are surfaced via error state inside reload.
    })
  }, [reload])

  const resetInlineEditors = () => {
    setEditingId(null)
    setEditForm(null)
    setPasswordId(null)
    setPasswordValue('')
    setConfirmingDeleteId(null)
  }

  const onCreate = () => {
    if (!canOwn) return
    const username = createForm.username.trim()
    if (!username || createForm.serviceIds.length === 0) {
      setError('Username and at least one service are required.')
      return
    }

    setCreating(true)
    setError(null)
    const body: CreatePrincipalBody = {
      kind: createForm.kind,
      provider: createForm.provider,
      username,
      serviceIds: createForm.serviceIds,
    }
    const metadata = buildMetadata(createForm)
    if (metadata) body.metadata = metadata

    const run = async () => {
      try {
        await createPrincipal(body)
        setCreateForm(EMPTY_FORM)
        await reload()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(errorMessage(err, 'Failed to create principal'))
      } finally {
        setCreating(false)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  const onSaveEdit = (id: string) => {
    if (!canOwn || !editForm) return
    const username = editForm.username.trim()
    if (!username || editForm.serviceIds.length === 0) {
      setError('Username and at least one service are required.')
      return
    }

    setEditSaving(true)
    setError(null)
    // Build explicitly: empty metadata fields send `{}` (clear), never `null`
    // (instance `parseJsonbObject` rejects null).
    const body = {
      kind: editForm.kind,
      provider: editForm.provider,
      username,
      metadata: buildMetadata(editForm) ?? {},
      serviceIds: editForm.serviceIds,
    }
    const run = async () => {
      try {
        await updatePrincipal(id, body)
        resetInlineEditors()
        await reload()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(errorMessage(err, 'Failed to update principal'))
      } finally {
        setEditSaving(false)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  const onSavePassword = (id: string) => {
    if (!canOwn || passwordValue.length === 0) return
    setPasswordSaving(true)
    setError(null)
    const run = async () => {
      try {
        await setPrincipalPassword(id, passwordValue)
        resetInlineEditors()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(errorMessage(err, 'Failed to set password'))
      } finally {
        setPasswordSaving(false)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  const onConfirmDelete = (id: string) => {
    if (!canOwn) return
    setDeletingId(id)
    setError(null)
    const run = async () => {
      try {
        await deletePrincipal(id)
        resetInlineEditors()
        await reload()
      } catch (err) {
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(errorMessage(err, 'Failed to delete principal'))
      } finally {
        setDeletingId(null)
      }
    }
    run().catch(() => {
      // Errors are surfaced via error state inside run.
    })
  }

  let listBody: ReactNode
  if (loading) {
    listBody = <Text style={orgPanelStyles.muted}>Loading…</Text>
  } else if (rows.length === 0) {
    listBody = <Text style={orgPanelStyles.muted}>No principals yet.</Text>
  } else {
    listBody = (
      <View style={styles.list}>
        {rows.map((row) => (
          <PrincipalCard
            key={row.id}
            row={row}
            servicesById={servicesById}
            services={services}
            canOwn={canOwn}
            editing={editingId === row.id}
            editForm={editingId === row.id ? editForm : null}
            editSaving={editSaving}
            passwordOpen={passwordId === row.id}
            passwordValue={passwordId === row.id ? passwordValue : ''}
            passwordSaving={passwordSaving}
            confirmingDelete={confirmingDeleteId === row.id}
            deleting={deletingId === row.id}
            onStartEdit={() => {
              setPasswordId(null)
              setPasswordValue('')
              setConfirmingDeleteId(null)
              setEditingId(row.id)
              setEditForm(formFromPrincipal(row))
            }}
            onCancelEdit={resetInlineEditors}
            onEditFormChange={setEditForm}
            onSaveEdit={() => onSaveEdit(row.id)}
            onStartPassword={() => {
              setEditingId(null)
              setEditForm(null)
              setConfirmingDeleteId(null)
              setPasswordId(row.id)
              setPasswordValue('')
            }}
            onCancelPassword={resetInlineEditors}
            onPasswordChange={setPasswordValue}
            onSavePassword={() => onSavePassword(row.id)}
            onRequestDeleteConfirm={() => {
              setEditingId(null)
              setEditForm(null)
              setPasswordId(null)
              setPasswordValue('')
              setConfirmingDeleteId(row.id)
            }}
            onCancelDeleteConfirm={() => setConfirmingDeleteId(null)}
            onConfirmDelete={() => onConfirmDelete(row.id)}
          />
        ))}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <SectionPanel
        title="Principals"
        hint="System and database accounts assigned to one or more services"
      >
        {listBody}
      </SectionPanel>

      {canOwn ? (
        <SectionPanel
          title="Add principal"
          hint="Password is set separately after create (write-only)"
        >
          <PrincipalFormFields
            form={createForm}
            services={services}
            onChange={setCreateForm}
          />
          <Pressable
            style={[styles.primaryButton, creating && styles.buttonDisabled]}
            disabled={creating}
            onPress={onCreate}
          >
            <Text style={styles.primaryButtonText}>
              {creating ? 'Creating…' : 'Create principal'}
            </Text>
          </Pressable>
        </SectionPanel>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  formFields: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgSecondary,
  },
  chipText: {
    color: colors.textDim,
    fontSize: 13,
  },
  chipTextActive: {
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  pickerList: {
    maxHeight: 180,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  pickerRow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowSelected: {
    backgroundColor: colors.bgSecondary,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 13,
  },
  pickerMeta: {
    color: colors.textDim,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  inlineForm: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    color: colors.textChip,
  },
  dangerButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dangerButtonText: {
    color: colors.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  error: {
    color: colors.error,
  },
})
