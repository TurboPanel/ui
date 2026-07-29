import { useEffect, useState, type ReactNode } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createVariable,
  deleteVariable,
  fetchVariables,
  isForbiddenError,
  updateVariable,
  type CreateVariableBody,
  type VariableParentFilter,
  type VariableRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
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

function displayVariableValue(variable: VariableRecord): string {
  if (variable.isSecret) {
    return '••••••••'
  }
  return variable.value ?? ''
}

const VARIABLE_PRESETS = [
  { key: 'PORT', value: '3000', isSecret: false },
  { key: 'NODE_ENV', value: 'production', isSecret: false },
  { key: 'DATABASE_URL', value: '', isSecret: true },
  { key: 'REDIS_URL', value: '', isSecret: true },
  { key: 'APP_SECRET', value: '', isSecret: true },
] as const

function VariablePresetRow({
  onPick,
}: Readonly<{
  onPick: (preset: (typeof VARIABLE_PRESETS)[number]) => void
}>) {
  return (
    <View style={styles.presetSection}>
      <Text style={styles.presetLabel}>Common keys</Text>
      <View style={styles.presetRow}>
        {VARIABLE_PRESETS.map((preset) => (
          <Pressable
            key={preset.key}
            style={styles.presetChip}
            onPress={() => onPick(preset)}
          >
            <Text style={styles.presetChipText}>{preset.key}</Text>
            {preset.isSecret ? (
              <Text style={styles.presetChipHint}>secret</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function inputStyle(hasError: boolean) {
  return [
    Platform.OS === 'web'
      ? {
          ...webInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.input,
    hasError && Platform.OS !== 'web' && styles.inputError,
  ]
}

function trimOnBlur(
  value: string,
  setter: (next: string) => void,
): { onBlur: () => void } {
  return {
    onBlur: () => {
      const trimmed = value.trim()
      if (trimmed !== value) {
        setter(trimmed)
      }
    },
  }
}

function VariableToggleRow({
  label,
  checked,
  disabled,
  onToggle,
}: Readonly<{
  label: string
  checked: boolean
  disabled: boolean
  onToggle: () => void
}>) {
  return (
    <Pressable style={styles.toggleRow} disabled={disabled} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
      </View>
      <Text style={styles.toggleLabel}>{label}</Text>
    </Pressable>
  )
}

function VariableFlagBadges({
  variable,
}: Readonly<{ variable: VariableRecord }>) {
  const flags: string[] = []
  if (variable.isLiteral) flags.push('literal')
  if (variable.forBuild) flags.push('build')
  if (!variable.forRuntime) flags.push('runtime off')
  if (flags.length === 0) return null
  return (
    <View style={styles.flagRow}>
      {flags.map((flag) => (
        <View key={flag} style={styles.flagBadge}>
          <Text style={styles.flagBadgeText}>{flag}</Text>
        </View>
      ))}
    </View>
  )
}

function VariableEditForm({
  editKey,
  editValue,
  editDescription,
  editIsLiteral,
  editForBuild,
  editForRuntime,
  editSaving,
  onKeyChange,
  onValueChange,
  onDescriptionChange,
  onToggleLiteral,
  onToggleForBuild,
  onToggleForRuntime,
  onSave,
  onCancel,
}: Readonly<{
  editKey: string
  editValue: string
  editDescription: string
  editIsLiteral: boolean
  editForBuild: boolean
  editForRuntime: boolean
  editSaving: boolean
  onKeyChange: (value: string) => void
  onValueChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onToggleLiteral: () => void
  onToggleForBuild: () => void
  onToggleForRuntime: () => void
  onSave: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <View style={styles.field}>
        <Text style={styles.label}>Key</Text>
        <TextInput
          style={inputStyle(false)}
          value={editKey}
          onChangeText={onKeyChange}
          {...trimOnBlur(editKey, onKeyChange)}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!editSaving}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={inputStyle(false)}
          value={editDescription}
          onChangeText={onDescriptionChange}
          {...trimOnBlur(editDescription, onDescriptionChange)}
          placeholder="Optional note"
          placeholderTextColor={colors.textDim}
          editable={!editSaving}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Value</Text>
        <TextInput
          style={[inputStyle(false), styles.multilineInput]}
          value={editValue}
          onChangeText={onValueChange}
          {...trimOnBlur(editValue, onValueChange)}
          multiline
          numberOfLines={4}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!editSaving}
        />
      </View>
      <VariableToggleRow
        label="Literal (no compose escaping)"
        checked={editIsLiteral}
        disabled={editSaving}
        onToggle={onToggleLiteral}
      />
      <VariableToggleRow
        label="Available at build time"
        checked={editForBuild}
        disabled={editSaving}
        onToggle={onToggleForBuild}
      />
      <VariableToggleRow
        label="Available at runtime"
        checked={editForRuntime}
        disabled={editSaving}
        onToggle={onToggleForRuntime}
      />
      <View style={styles.rowActions}>
        <Pressable
          style={[styles.submitButton, editSaving && styles.buttonDisabled]}
          disabled={editSaving}
          onPress={onSave}
        >
          <Text style={styles.submitButtonText}>
            {editSaving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function VariableSecretUpdateForm({
  variableKey,
  secretNewValue,
  secretSaving,
  onValueChange,
  onSave,
  onCancel,
}: Readonly<{
  variableKey: string
  secretNewValue: string
  secretSaving: boolean
  onValueChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <Text style={styles.monoKey}>{variableKey}</Text>
      <View style={styles.field}>
        <Text style={styles.label}>New value</Text>
        <TextInput
          style={inputStyle(false)}
          value={secretNewValue}
          onChangeText={onValueChange}
          placeholder="Enter new secret value"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!secretSaving}
          secureTextEntry
        />
      </View>
      <View style={styles.rowActions}>
        <Pressable
          style={[styles.submitButton, secretSaving && styles.buttonDisabled]}
          disabled={secretSaving}
          onPress={onSave}
        >
          <Text style={styles.submitButtonText}>
            {secretSaving ? 'Saving…' : 'Save secret'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function VariableOwnerActions({
  variable,
  isDeleting,
  onEdit,
  onSecretUpdate,
  onDelete,
}: Readonly<{
  variable: VariableRecord
  isDeleting: boolean
  onEdit: (variable: VariableRecord) => void
  onSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
}>) {
  let editAction: ReactNode
  if (variable.isSecret) {
    editAction = (
      <Pressable
        style={styles.secondaryButton}
        onPress={() => onSecretUpdate(variable)}
      >
        <Text style={styles.secondaryButtonText}>Update value</Text>
      </Pressable>
    )
  } else {
    editAction = (
      <Pressable
        style={styles.secondaryButton}
        onPress={() => onEdit(variable)}
      >
        <Text style={styles.secondaryButtonText}>Edit</Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.rowActions}>
      {editAction}
      <Pressable
        style={[styles.secondaryButton, isDeleting && styles.buttonDisabled]}
        disabled={isDeleting}
        onPress={() => onDelete(variable.id)}
      >
        <Text style={styles.secondaryButtonText}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Text>
      </Pressable>
    </View>
  )
}

function VariableDisplayCard({
  variable,
  canOwn,
  isDeleting,
  onEdit,
  onSecretUpdate,
  onDelete,
}: Readonly<{
  variable: VariableRecord
  canOwn: boolean
  isDeleting: boolean
  onEdit: (variable: VariableRecord) => void
  onSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
}>) {
  return (
    <>
      <View style={styles.variableHeader}>
        <View style={styles.keyRow}>
          <Text style={styles.monoKey}>{variable.key}</Text>
          {variable.isSecret ? (
            <View style={styles.secretBadge}>
              <Text style={styles.secretBadgeText}>SECRET</Text>
            </View>
          ) : null}
        </View>
        {canOwn ? (
          <VariableOwnerActions
            variable={variable}
            isDeleting={isDeleting}
            onEdit={onEdit}
            onSecretUpdate={onSecretUpdate}
            onDelete={onDelete}
          />
        ) : null}
      </View>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Value: </Text>
        {displayVariableValue(variable)}
      </Text>
      {variable.description ? (
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Description: </Text>
          {variable.description}
        </Text>
      ) : null}
      <VariableFlagBadges variable={variable} />
    </>
  )
}

function VariableCard({
  variable,
  canOwn,
  isEditing,
  isUpdatingSecret,
  isDeleting,
  editKey,
  editValue,
  editDescription,
  editIsLiteral,
  editForBuild,
  editForRuntime,
  editSaving,
  secretNewValue,
  secretSaving,
  onEditKeyChange,
  onEditValueChange,
  onEditDescriptionChange,
  onToggleEditLiteral,
  onToggleEditForBuild,
  onToggleEditForRuntime,
  onSaveEdit,
  onCancelEdit,
  onSecretValueChange,
  onSaveSecret,
  onCancelSecret,
  onEdit,
  onSecretUpdate,
  onDelete,
}: Readonly<{
  variable: VariableRecord
  canOwn: boolean
  isEditing: boolean
  isUpdatingSecret: boolean
  isDeleting: boolean
  editKey: string
  editValue: string
  editDescription: string
  editIsLiteral: boolean
  editForBuild: boolean
  editForRuntime: boolean
  editSaving: boolean
  secretNewValue: string
  secretSaving: boolean
  onEditKeyChange: (value: string) => void
  onEditValueChange: (value: string) => void
  onEditDescriptionChange: (value: string) => void
  onToggleEditLiteral: () => void
  onToggleEditForBuild: () => void
  onToggleEditForRuntime: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSecretValueChange: (value: string) => void
  onSaveSecret: () => void
  onCancelSecret: () => void
  onEdit: (variable: VariableRecord) => void
  onSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
}>) {
  if (isEditing && !variable.isSecret) {
    return (
      <View style={orgPanelStyles.detailCard}>
        <VariableEditForm
          editKey={editKey}
          editValue={editValue}
          editDescription={editDescription}
          editIsLiteral={editIsLiteral}
          editForBuild={editForBuild}
          editForRuntime={editForRuntime}
          editSaving={editSaving}
          onKeyChange={onEditKeyChange}
          onValueChange={onEditValueChange}
          onDescriptionChange={onEditDescriptionChange}
          onToggleLiteral={onToggleEditLiteral}
          onToggleForBuild={onToggleEditForBuild}
          onToggleForRuntime={onToggleEditForRuntime}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      </View>
    )
  }

  if (isUpdatingSecret) {
    return (
      <View style={orgPanelStyles.detailCard}>
        <VariableSecretUpdateForm
          variableKey={variable.key}
          secretNewValue={secretNewValue}
          secretSaving={secretSaving}
          onValueChange={onSecretValueChange}
          onSave={onSaveSecret}
          onCancel={onCancelSecret}
        />
      </View>
    )
  }

  return (
    <View style={orgPanelStyles.detailCard}>
      <VariableDisplayCard
        variable={variable}
        canOwn={canOwn}
        isDeleting={isDeleting}
        onEdit={onEdit}
        onSecretUpdate={onSecretUpdate}
        onDelete={onDelete}
      />
    </View>
  )
}

function VariablesListContent({
  loading,
  variables,
  canOwn,
  deleting,
  editingId,
  updatingSecretId,
  editKey,
  editValue,
  editDescription,
  editIsLiteral,
  editForBuild,
  editForRuntime,
  editSaving,
  secretNewValue,
  secretSaving,
  onEditKeyChange,
  onEditValueChange,
  onEditDescriptionChange,
  onToggleEditLiteral,
  onToggleEditForBuild,
  onToggleEditForRuntime,
  onSaveEdit,
  onCancelEdit,
  onSecretValueChange,
  onSaveSecret,
  onCancelSecret,
  onEdit,
  onSecretUpdate,
  onDelete,
}: Readonly<{
  loading: boolean
  variables: VariableRecord[]
  canOwn: boolean
  deleting: Set<string>
  editingId: string | null
  updatingSecretId: string | null
  editKey: string
  editValue: string
  editDescription: string
  editIsLiteral: boolean
  editForBuild: boolean
  editForRuntime: boolean
  editSaving: boolean
  secretNewValue: string
  secretSaving: boolean
  onEditKeyChange: (value: string) => void
  onEditValueChange: (value: string) => void
  onEditDescriptionChange: (value: string) => void
  onToggleEditLiteral: () => void
  onToggleEditForBuild: () => void
  onToggleEditForRuntime: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSecretValueChange: (value: string) => void
  onSaveSecret: () => void
  onCancelSecret: () => void
  onEdit: (variable: VariableRecord) => void
  onSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
}>) {
  if (loading && variables.length === 0) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }

  if (variables.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No variables yet — add keys your compose references with {'${KEY}'}.
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      <View style={styles.tableHeader}>
        <Text style={styles.tableHeaderCell}>Key</Text>
        <Text style={styles.tableHeaderCell}>Value</Text>
      </View>
      {variables.map((variable) => (
        <VariableCard
          key={variable.id}
          variable={variable}
          canOwn={canOwn}
          isEditing={editingId === variable.id}
          isUpdatingSecret={updatingSecretId === variable.id}
          isDeleting={deleting.has(variable.id)}
          editKey={editKey}
          editValue={editValue}
          editDescription={editDescription}
          editIsLiteral={editIsLiteral}
          editForBuild={editForBuild}
          editForRuntime={editForRuntime}
          editSaving={editSaving}
          secretNewValue={secretNewValue}
          secretSaving={secretSaving}
          onEditKeyChange={onEditKeyChange}
          onEditValueChange={onEditValueChange}
          onEditDescriptionChange={onEditDescriptionChange}
          onToggleEditLiteral={onToggleEditLiteral}
          onToggleEditForBuild={onToggleEditForBuild}
          onToggleEditForRuntime={onToggleEditForRuntime}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onSecretValueChange={onSecretValueChange}
          onSaveSecret={onSaveSecret}
          onCancelSecret={onCancelSecret}
          onEdit={onEdit}
          onSecretUpdate={onSecretUpdate}
          onDelete={onDelete}
        />
      ))}
    </View>
  )
}

function AddVariableForm({
  newKey,
  newValue,
  newDescription,
  newIsSecret,
  newIsLiteral,
  newForBuild,
  newForRuntime,
  addFieldError,
  adding,
  onKeyChange,
  onValueChange,
  onDescriptionChange,
  onToggleSecret,
  onToggleLiteral,
  onToggleForBuild,
  onToggleForRuntime,
  onSubmit,
}: Readonly<{
  newKey: string
  newValue: string
  newDescription: string
  newIsSecret: boolean
  newIsLiteral: boolean
  newForBuild: boolean
  newForRuntime: boolean
  addFieldError: string | null
  adding: boolean
  onKeyChange: (value: string) => void
  onValueChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onToggleSecret: () => void
  onToggleLiteral: () => void
  onToggleForBuild: () => void
  onToggleForRuntime: () => void
  onSubmit: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <View style={styles.field}>
        <Text style={styles.label}>Key *</Text>
        <TextInput
          style={inputStyle(Boolean(addFieldError))}
          value={newKey}
          onChangeText={onKeyChange}
          {...trimOnBlur(newKey, onKeyChange)}
          placeholder="e.g. DATABASE_URL"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!adding}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={inputStyle(false)}
          value={newDescription}
          onChangeText={onDescriptionChange}
          {...trimOnBlur(newDescription, onDescriptionChange)}
          placeholder="Optional note"
          placeholderTextColor={colors.textDim}
          editable={!adding}
        />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Value</Text>
        <TextInput
          style={[inputStyle(false), styles.multilineInput]}
          value={newValue}
          onChangeText={onValueChange}
          {...trimOnBlur(newValue, onValueChange)}
          placeholder={
            newIsSecret ? 'Secret value (write-only)' : 'Plaintext value'
          }
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!adding}
          secureTextEntry={newIsSecret}
          multiline
          numberOfLines={4}
        />
      </View>
      <VariableToggleRow
        label="Secret"
        checked={newIsSecret}
        disabled={adding}
        onToggle={onToggleSecret}
      />
      <VariableToggleRow
        label="Literal (no compose escaping)"
        checked={newIsLiteral}
        disabled={adding}
        onToggle={onToggleLiteral}
      />
      <VariableToggleRow
        label="Available at build time"
        checked={newForBuild}
        disabled={adding}
        onToggle={onToggleForBuild}
      />
      <VariableToggleRow
        label="Available at runtime"
        checked={newForRuntime}
        disabled={adding}
        onToggle={onToggleForRuntime}
      />
      {addFieldError ? (
        <Text style={styles.fieldError}>{addFieldError}</Text>
      ) : null}
      <Pressable
        style={[styles.submitButton, adding && styles.buttonDisabled]}
        disabled={adding}
        onPress={onSubmit}
      >
        <Text style={styles.submitButtonText}>
          {adding ? 'Adding…' : 'Add variable'}
        </Text>
      </Pressable>
    </View>
  )
}

export function VariablesSection({
  orgId,
  parentField,
  title = 'Variables',
  hint = 'Injected into compose at deploy — lower scopes override',
  embedded = false,
  showPresets = true,
}: Readonly<{
  orgId: string
  parentField: VariableParentFilter
  /** Panel title (ignored when `embedded`). */
  title?: string
  /** Panel hint (ignored when `embedded`). */
  hint?: string
  /**
   * When true, render the editor body without a surrounding `SectionPanel`
   * (for nesting under hosting / service cards).
   */
  embedded?: boolean
  /** Common-key preset chips above the add form. */
  showPresets?: boolean
}>) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [variables, setVariables] = useState<VariableRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newIsSecret, setNewIsSecret] = useState(false)
  const [newIsLiteral, setNewIsLiteral] = useState(false)
  const [newForBuild, setNewForBuild] = useState(false)
  const [newForRuntime, setNewForRuntime] = useState(true)
  const [addFieldError, setAddFieldError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editIsLiteral, setEditIsLiteral] = useState(false)
  const [editForBuild, setEditForBuild] = useState(false)
  const [editForRuntime, setEditForRuntime] = useState(true)
  const [editSaving, setEditSaving] = useState(false)
  const [updatingSecretId, setUpdatingSecretId] = useState<string | null>(null)
  const [secretNewValue, setSecretNewValue] = useState('')
  const [secretSaving, setSecretSaving] = useState(false)

  const loadVariables = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchVariables(parentField)
      setVariables(result.variables)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to load variables',
      )
    } finally {
      setLoading(false)
    }
  }

  const parentQueryKey = JSON.stringify(parentField)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchVariables(parentField)
        if (!cancelled) {
          setVariables(result.variables)
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load variables',
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
  }, [parentQueryKey, handleUnauthorized])

  const handleDeleteVariable = async (id: string) => {
    setDeleting((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteVariable(id)
      if (editingId === id) {
        setEditingId(null)
      }
      if (updatingSecretId === id) {
        setUpdatingSecretId(null)
        setSecretNewValue('')
      }
      await loadVariables()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to delete variable',
      )
    } finally {
      setDeleting((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  const handleAddVariable = async () => {
    const trimmedKey = newKey.trim()
    if (!trimmedKey) {
      setAddFieldError('Key is required.')
      return
    }
    const trimmedValue = newValue.trim()
    if (!trimmedValue && !newIsSecret) {
      setAddFieldError('Value is required for non-secret variables.')
      return
    }

    setAdding(true)
    setAddFieldError(null)
    setError(null)
    try {
      await createVariable({
        ...parentField,
        key: trimmedKey,
        value: trimmedValue,
        isSecret: newIsSecret,
        isLiteral: newIsLiteral,
        forBuild: newForBuild,
        forRuntime: newForRuntime,
        ...(newDescription.trim()
          ? { description: newDescription.trim() }
          : {}),
      } satisfies CreateVariableBody)
      setNewKey('')
      setNewValue('')
      setNewDescription('')
      setNewIsSecret(false)
      setNewIsLiteral(false)
      setNewForBuild(false)
      setNewForRuntime(true)
      setShowAddForm(false)
      await loadVariables()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to create variable',
      )
    } finally {
      setAdding(false)
    }
  }

  const startEdit = (variable: VariableRecord) => {
    if (variable.isSecret) {
      return
    }
    setEditingId(variable.id)
    setEditKey(variable.key)
    setEditValue(variable.value ?? '')
    setEditDescription(variable.description ?? '')
    setEditIsLiteral(variable.isLiteral)
    setEditForBuild(variable.forBuild)
    setEditForRuntime(variable.forRuntime)
    setUpdatingSecretId(null)
    setSecretNewValue('')
  }

  const startSecretUpdate = (variable: VariableRecord) => {
    setUpdatingSecretId(variable.id)
    setSecretNewValue('')
    setEditingId(null)
  }

  const handleSaveEdit = async () => {
    if (!editingId) {
      return
    }
    const trimmedKey = editKey.trim()
    if (!trimmedKey) {
      setError('Key is required.')
      return
    }

    setEditSaving(true)
    setError(null)
    try {
      await updateVariable(editingId, {
        key: trimmedKey,
        value: editValue.trim(),
        description: editDescription.trim() || null,
        isLiteral: editIsLiteral,
        forBuild: editForBuild,
        forRuntime: editForRuntime,
      })
      setEditingId(null)
      await loadVariables()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to update variable',
      )
    } finally {
      setEditSaving(false)
    }
  }

  const handleSaveSecretValue = async () => {
    if (!updatingSecretId) {
      return
    }
    if (!secretNewValue) {
      setError('Enter a new secret value.')
      return
    }

    setSecretSaving(true)
    setError(null)
    try {
      await updateVariable(updatingSecretId, { value: secretNewValue })
      setUpdatingSecretId(null)
      setSecretNewValue('')
      await loadVariables()
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(
        err instanceof Error ? err.message : 'Failed to update secret value',
      )
    } finally {
      setSecretSaving(false)
    }
  }

  const body = (
    <>
      {showPresets && canOwn ? (
        <VariablePresetRow
          onPick={(preset) => {
            setShowAddForm(true)
            setNewKey(preset.key)
            setNewValue(preset.value)
            setNewIsSecret(preset.isSecret)
            setAddFieldError(null)
          }}
        />
      ) : null}

      {canOwn ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() => setShowAddForm((current) => !current)}
        >
          <Text style={styles.primaryButtonText}>
            {showAddForm ? 'Cancel' : 'Add variable'}
          </Text>
        </Pressable>
      ) : null}

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {showAddForm && canOwn ? (
        <AddVariableForm
          newKey={newKey}
          newValue={newValue}
          newDescription={newDescription}
          newIsSecret={newIsSecret}
          newIsLiteral={newIsLiteral}
          newForBuild={newForBuild}
          newForRuntime={newForRuntime}
          addFieldError={addFieldError}
          adding={adding}
          onKeyChange={(t) => {
            setNewKey(t)
            setAddFieldError(null)
          }}
          onValueChange={setNewValue}
          onDescriptionChange={setNewDescription}
          onToggleSecret={() => setNewIsSecret((current) => !current)}
          onToggleLiteral={() => setNewIsLiteral((current) => !current)}
          onToggleForBuild={() => setNewForBuild((current) => !current)}
          onToggleForRuntime={() => setNewForRuntime((current) => !current)}
          onSubmit={() => void handleAddVariable()}
        />
      ) : null}

      <VariablesListContent
        loading={loading}
        variables={variables}
        canOwn={canOwn}
        deleting={deleting}
        editingId={editingId}
        updatingSecretId={updatingSecretId}
        editKey={editKey}
        editValue={editValue}
        editDescription={editDescription}
        editIsLiteral={editIsLiteral}
        editForBuild={editForBuild}
        editForRuntime={editForRuntime}
        editSaving={editSaving}
        secretNewValue={secretNewValue}
        secretSaving={secretSaving}
        onEditKeyChange={setEditKey}
        onEditValueChange={setEditValue}
        onEditDescriptionChange={setEditDescription}
        onToggleEditLiteral={() => setEditIsLiteral((current) => !current)}
        onToggleEditForBuild={() => setEditForBuild((current) => !current)}
        onToggleEditForRuntime={() => setEditForRuntime((current) => !current)}
        onSaveEdit={() => void handleSaveEdit()}
        onCancelEdit={() => setEditingId(null)}
        onSecretValueChange={setSecretNewValue}
        onSaveSecret={() => void handleSaveSecretValue()}
        onCancelSecret={() => {
          setUpdatingSecretId(null)
          setSecretNewValue('')
        }}
        onEdit={startEdit}
        onSecretUpdate={startSecretUpdate}
        onDelete={(id) => void handleDeleteVariable(id)}
      />
    </>
  )

  if (embedded) {
    return <View style={styles.embedded}>{body}</View>
  }

  return (
    <SectionPanel title={title} hint={hint}>
      {body}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  embedded: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  list: {
    gap: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  tableHeaderCell: {
    flex: 1,
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  presetSection: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  presetLabel: {
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  presetChipText: {
    color: colors.command,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  presetChipHint: {
    color: colors.pending,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  variableHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    flex: 1,
  },
  monoKey: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  secretBadge: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.pending,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  secretBadgeText: {
    color: colors.pending,
    fontSize: 10,
    fontWeight: '700',
  },
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: chrome.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSecondary,
  },
  secondaryButtonText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  inlineForm: {
    gap: spacing.sm,
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
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
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
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    borderColor: chrome.accent,
    backgroundColor: colors.bgActive,
  },
  checkboxMark: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  toggleLabel: {
    color: colors.textBody,
    fontSize: 13,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  submitButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  flagBadge: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  flagBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
})
