import { useState } from 'react'
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import type { VariableParentFilter, VariableRecord } from '@/lib/instance-api'
import {
  useCreateVariable,
  useDeleteVariable,
  useUpdateVariable,
  useVariables,
} from '@/lib/queries/variables'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

/** Secret values are write-only end to end — never rendered, even masked with real characters. */
const HIDDEN_VALUE_LABEL = '***HIDDEN***'

type VariableBooleanField = 'forBuild' | 'forRuntime' | 'isLiteral'
type VariableViewMode = 'table' | 'developer'

function displayVariableValue(variable: VariableRecord): string {
  if (variable.isSecret) {
    return HIDDEN_VALUE_LABEL
  }
  return variable.value ?? ''
}

function isBindingOwnedVariable(variable: VariableRecord): boolean {
  return variable.bindingId != null && variable.bindingId.length > 0
}

function resolveVariablesLoadError(
  isError: boolean,
  error: unknown,
): string | null {
  if (!isError) {
    return null
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Failed to load variables'
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

function cellInputStyle(hasError: boolean) {
  return [
    Platform.OS === 'web'
      ? {
          ...webCellInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.cellInput,
    hasError && Platform.OS !== 'web' && styles.cellInputError,
  ]
}

const webCellInputStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.bgInput,
  color: colors.text,
  paddingHorizontal: 8,
  paddingVertical: 6,
  fontSize: 13,
  borderRadius: 6,
  minHeight: 32,
} as const

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

function CheckboxIndicator({
  pending,
  checked,
}: Readonly<{ pending: boolean; checked: boolean }>) {
  if (pending) {
    return (
      <ActivityIndicator
        size="small"
        color={colors.textMuted}
        style={styles.checkboxSpinner}
      />
    )
  }
  if (checked) {
    return <Text style={styles.checkboxMark}>✓</Text>
  }
  return null
}

/** Bare boolean toggle — used for the Build / Runtime table columns. */
function Checkbox({
  checked,
  disabled,
  pending,
  onToggle,
}: Readonly<{
  checked: boolean
  disabled: boolean
  pending: boolean
  onToggle: () => void
}>) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: disabled || pending }}
      disabled={disabled || pending}
      onPress={onToggle}
      style={[
        styles.checkbox,
        checked && styles.checkboxChecked,
        (disabled || pending) && styles.checkboxDisabled,
      ]}
    >
      <CheckboxIndicator pending={pending} checked={checked} />
    </Pressable>
  )
}

/** Interactive Type checkbox for the add-variable row (Secret is chosen once, at creation). */
function TypeCheckbox({
  checked,
  disabled,
  onToggle,
}: Readonly<{ checked: boolean; disabled: boolean; onToggle: () => void }>) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onToggle}
      style={styles.labeledCheckbox}
    >
      <View
        style={[
          styles.checkbox,
          checked && styles.checkboxChecked,
          disabled && styles.checkboxDisabled,
        ]}
      >
        <CheckboxIndicator pending={false} checked={checked} />
      </View>
      <Text style={styles.labeledCheckboxText}>Secret</Text>
    </Pressable>
  )
}

/** Read-only Type indicator for existing rows — secret status is fixed at creation. */
function TypeCell({ secret }: Readonly<{ secret: boolean }>) {
  return (
    <View style={styles.labeledCheckbox}>
      <View style={[styles.checkbox, secret && styles.checkboxChecked, styles.checkboxDisabled]}>
        <CheckboxIndicator pending={false} checked={secret} />
      </View>
      <Text style={styles.labeledCheckboxText}>Secret</Text>
    </View>
  )
}

function FlagChip({
  label,
  checked,
  disabled,
  pending,
  onToggle,
}: Readonly<{
  label: string
  checked: boolean
  disabled: boolean
  pending: boolean
  onToggle: () => void
}>) {
  return (
    <Pressable
      disabled={disabled || pending}
      onPress={onToggle}
      style={[styles.flagChip, checked && styles.flagChipActive]}
    >
      <Text style={[styles.flagChipText, checked && styles.flagChipTextActive]}>
        {label}
      </Text>
    </Pressable>
  )
}

function ViewModeTabs({
  value,
  onChange,
}: Readonly<{
  value: VariableViewMode
  onChange: (view: VariableViewMode) => void
}>) {
  return (
    <View style={styles.viewTabList} accessibilityRole="tablist">
      {(
        [
          ['table', 'Table'],
          ['developer', 'Developer'],
        ] as const
      ).map(([entry, label]) => {
        const active = value === entry
        return (
          <Pressable
            key={entry}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.viewTab, active && styles.viewTabActive]}
            onPress={() => onChange(entry)}
          >
            <Text style={[styles.viewTabText, active && styles.viewTabTextActive]}>
              {label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function VariableNameCell({
  variable,
  isEditing,
  editKey,
  editDescription,
  editSaving,
  canOwn,
  literalPending,
  onEditKeyChange,
  onEditDescriptionChange,
  onToggleLiteral,
}: Readonly<{
  variable: VariableRecord
  isEditing: boolean
  editKey: string
  editDescription: string
  editSaving: boolean
  canOwn: boolean
  literalPending: boolean
  onEditKeyChange: (value: string) => void
  onEditDescriptionChange: (value: string) => void
  onToggleLiteral: () => void
}>) {
  if (isEditing) {
    return (
      <View style={styles.cellStack}>
        <TextInput
          style={cellInputStyle(false)}
          value={editKey}
          onChangeText={onEditKeyChange}
          {...trimOnBlur(editKey, onEditKeyChange)}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!editSaving}
        />
        <TextInput
          style={cellInputStyle(false)}
          value={editDescription}
          onChangeText={onEditDescriptionChange}
          {...trimOnBlur(editDescription, onEditDescriptionChange)}
          placeholder="Description (optional)"
          placeholderTextColor={colors.textDim}
          editable={!editSaving}
        />
        <FlagChip
          label="Literal"
          checked={variable.isLiteral}
          disabled={!canOwn}
          pending={literalPending}
          onToggle={onToggleLiteral}
        />
      </View>
    )
  }

  return (
    <View style={styles.cellStack}>
      <Text style={styles.monoKey} numberOfLines={1}>
        {variable.key}
      </Text>
      {variable.description ? (
        <Text style={styles.descriptionText} numberOfLines={1}>
          {variable.description}
        </Text>
      ) : null}
      <FlagChip
        label="Literal"
        checked={variable.isLiteral}
        disabled={!canOwn}
        pending={literalPending}
        onToggle={onToggleLiteral}
      />
    </View>
  )
}

function VariableValueCell({
  variable,
  isEditing,
  isUpdatingSecret,
  editValue,
  editSaving,
  secretNewValue,
  secretSaving,
  onEditValueChange,
  onSecretValueChange,
}: Readonly<{
  variable: VariableRecord
  isEditing: boolean
  isUpdatingSecret: boolean
  editValue: string
  editSaving: boolean
  secretNewValue: string
  secretSaving: boolean
  onEditValueChange: (value: string) => void
  onSecretValueChange: (value: string) => void
}>) {
  if (isEditing) {
    return (
      <TextInput
        style={[cellInputStyle(false), styles.cellMultiline]}
        value={editValue}
        onChangeText={onEditValueChange}
        {...trimOnBlur(editValue, onEditValueChange)}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        editable={!editSaving}
      />
    )
  }
  if (isUpdatingSecret) {
    return (
      <TextInput
        style={cellInputStyle(false)}
        value={secretNewValue}
        onChangeText={onSecretValueChange}
        placeholder="Enter new secret value"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!secretSaving}
        secureTextEntry
      />
    )
  }
  return (
    <Text
      style={[styles.valueText, variable.isSecret && styles.valueSecretText]}
      numberOfLines={1}
    >
      {displayVariableValue(variable)}
    </Text>
  )
}

function VariableEditActions({
  saving,
  savingLabel,
  onSave,
  onCancel,
}: Readonly<{
  saving: boolean
  savingLabel: string
  onSave: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.actionsCell}>
      <Pressable style={styles.actionLink} disabled={saving} onPress={onSave}>
        <Text style={[styles.actionLinkText, styles.actionLinkTextPrimary]}>
          {saving ? 'Saving…' : savingLabel}
        </Text>
      </Pressable>
      <Pressable style={styles.actionLink} onPress={onCancel}>
        <Text style={styles.actionLinkText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

function VariableRowActions({
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
  return (
    <View style={styles.actionsCell}>
      <Pressable
        style={styles.actionLink}
        onPress={() =>
          variable.isSecret ? onSecretUpdate(variable) : onEdit(variable)
        }
      >
        <Text style={styles.actionLinkText}>
          {variable.isSecret ? 'Update' : 'Edit'}
        </Text>
      </Pressable>
      <Pressable
        style={styles.actionLink}
        disabled={isDeleting}
        onPress={() => onDelete(variable.id)}
      >
        <Text style={[styles.actionLinkText, styles.actionLinkTextDanger]}>
          {isDeleting ? '…' : 'Delete'}
        </Text>
      </Pressable>
    </View>
  )
}

function VariableActionsCell({
  canOwn,
  variable,
  isEditing,
  isUpdatingSecret,
  isDeleting,
  editSaving,
  secretSaving,
  onSaveEdit,
  onCancelEdit,
  onSaveSecret,
  onCancelSecret,
  onStartEdit,
  onStartSecretUpdate,
  onDelete,
}: Readonly<{
  canOwn: boolean
  variable: VariableRecord
  isEditing: boolean
  isUpdatingSecret: boolean
  isDeleting: boolean
  editSaving: boolean
  secretSaving: boolean
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSaveSecret: () => void
  onCancelSecret: () => void
  onStartEdit: (variable: VariableRecord) => void
  onStartSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
}>) {
  if (!canOwn) {
    return <View style={styles.colActions} />
  }
  if (isEditing) {
    return (
      <VariableEditActions
        saving={editSaving}
        savingLabel="Save"
        onSave={onSaveEdit}
        onCancel={onCancelEdit}
      />
    )
  }
  if (isUpdatingSecret) {
    return (
      <VariableEditActions
        saving={secretSaving}
        savingLabel="Update"
        onSave={onSaveSecret}
        onCancel={onCancelSecret}
      />
    )
  }
  return (
    <VariableRowActions
      variable={variable}
      isDeleting={isDeleting}
      onEdit={onStartEdit}
      onSecretUpdate={onStartSecretUpdate}
      onDelete={onDelete}
    />
  )
}

function VariableTableRow({
  variable,
  canOwn,
  isEditing,
  isUpdatingSecret,
  isDeleting,
  editKey,
  editValue,
  editDescription,
  editSaving,
  secretNewValue,
  secretSaving,
  togglingKey,
  zebra,
  onEditKeyChange,
  onEditValueChange,
  onEditDescriptionChange,
  onSaveEdit,
  onCancelEdit,
  onSecretValueChange,
  onSaveSecret,
  onCancelSecret,
  onStartEdit,
  onStartSecretUpdate,
  onDelete,
  onToggleFlag,
}: Readonly<{
  variable: VariableRecord
  canOwn: boolean
  isEditing: boolean
  isUpdatingSecret: boolean
  isDeleting: boolean
  editKey: string
  editValue: string
  editDescription: string
  editSaving: boolean
  secretNewValue: string
  secretSaving: boolean
  togglingKey: string | null
  zebra: boolean
  onEditKeyChange: (value: string) => void
  onEditValueChange: (value: string) => void
  onEditDescriptionChange: (value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSecretValueChange: (value: string) => void
  onSaveSecret: () => void
  onCancelSecret: () => void
  onStartEdit: (variable: VariableRecord) => void
  onStartSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
  onToggleFlag: (variable: VariableRecord, field: VariableBooleanField) => void
}>) {
  const showEditFields = isEditing && !variable.isSecret

  return (
    <View style={[styles.row, zebra && styles.rowEven]}>
      <View style={styles.colType}>
        <TypeCell secret={variable.isSecret} />
      </View>
      <View style={styles.colName}>
        <VariableNameCell
          variable={variable}
          isEditing={showEditFields}
          editKey={editKey}
          editDescription={editDescription}
          editSaving={editSaving}
          canOwn={canOwn}
          literalPending={togglingKey === `${variable.id}:isLiteral`}
          onEditKeyChange={onEditKeyChange}
          onEditDescriptionChange={onEditDescriptionChange}
          onToggleLiteral={() => onToggleFlag(variable, 'isLiteral')}
        />
      </View>
      <View style={styles.colValue}>
        <VariableValueCell
          variable={variable}
          isEditing={showEditFields}
          isUpdatingSecret={isUpdatingSecret}
          editValue={editValue}
          editSaving={editSaving}
          secretNewValue={secretNewValue}
          secretSaving={secretSaving}
          onEditValueChange={onEditValueChange}
          onSecretValueChange={onSecretValueChange}
        />
      </View>
      <View style={[styles.colBuild, styles.colCenter]}>
        <Checkbox
          checked={variable.forBuild}
          disabled={!canOwn}
          pending={togglingKey === `${variable.id}:forBuild`}
          onToggle={() => onToggleFlag(variable, 'forBuild')}
        />
      </View>
      <View style={[styles.colRuntime, styles.colCenter]}>
        <Checkbox
          checked={variable.forRuntime}
          disabled={!canOwn}
          pending={togglingKey === `${variable.id}:forRuntime`}
          onToggle={() => onToggleFlag(variable, 'forRuntime')}
        />
      </View>
      <VariableActionsCell
        canOwn={canOwn}
        variable={variable}
        isEditing={showEditFields}
        isUpdatingSecret={isUpdatingSecret}
        isDeleting={isDeleting}
        editSaving={editSaving}
        secretSaving={secretSaving}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onSaveSecret={onSaveSecret}
        onCancelSecret={onCancelSecret}
        onStartEdit={onStartEdit}
        onStartSecretUpdate={onStartSecretUpdate}
        onDelete={onDelete}
      />
    </View>
  )
}

function NewVariableRow({
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
  onCancel,
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
  onCancel: () => void
}>) {
  return (
    <View style={[styles.row, styles.rowNew]}>
      <View style={styles.colType}>
        <TypeCheckbox
          checked={newIsSecret}
          disabled={adding}
          onToggle={onToggleSecret}
        />
      </View>
      <View style={styles.colName}>
        <TextInput
          style={cellInputStyle(Boolean(addFieldError))}
          value={newKey}
          onChangeText={onKeyChange}
          {...trimOnBlur(newKey, onKeyChange)}
          placeholder="KEY_NAME"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!adding}
        />
        <TextInput
          style={cellInputStyle(false)}
          value={newDescription}
          onChangeText={onDescriptionChange}
          {...trimOnBlur(newDescription, onDescriptionChange)}
          placeholder="Description (optional)"
          placeholderTextColor={colors.textDim}
          editable={!adding}
        />
        <FlagChip
          label="Literal"
          checked={newIsLiteral}
          disabled={adding}
          pending={false}
          onToggle={onToggleLiteral}
        />
        {addFieldError ? (
          <Text style={styles.fieldError}>{addFieldError}</Text>
        ) : null}
      </View>
      <View style={styles.colValue}>
        <TextInput
          style={[cellInputStyle(false), styles.cellMultiline]}
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
        />
      </View>
      <View style={[styles.colBuild, styles.colCenter]}>
        <Checkbox
          checked={newForBuild}
          disabled={adding}
          pending={false}
          onToggle={onToggleForBuild}
        />
      </View>
      <View style={[styles.colRuntime, styles.colCenter]}>
        <Checkbox
          checked={newForRuntime}
          disabled={adding}
          pending={false}
          onToggle={onToggleForRuntime}
        />
      </View>
      <VariableEditActions
        saving={adding}
        savingLabel="Add"
        onSave={onSubmit}
        onCancel={onCancel}
      />
    </View>
  )
}

function VariablesTableHeader() {
  return (
    <View style={[styles.row, styles.headerRow]}>
      <Text style={[styles.headerCell, styles.colType]}>Type</Text>
      <Text style={[styles.headerCell, styles.colName]}>Name</Text>
      <Text style={[styles.headerCell, styles.colValue]}>Value</Text>
      <Text style={[styles.headerCell, styles.colBuild, styles.headerCellCenter]}>
        Build
      </Text>
      <Text
        style={[styles.headerCell, styles.colRuntime, styles.headerCellCenter]}
      >
        Runtime
      </Text>
      <View style={styles.colActions} />
    </View>
  )
}

function VariablesTable({
  loading,
  variables,
  canOwn,
  showAddForm,
  newKey,
  newValue,
  newDescription,
  newIsSecret,
  newIsLiteral,
  newForBuild,
  newForRuntime,
  addFieldError,
  adding,
  deletingId,
  editingId,
  updatingSecretId,
  editKey,
  editValue,
  editDescription,
  editSaving,
  secretNewValue,
  secretSaving,
  togglingKey,
  onNewKeyChange,
  onNewValueChange,
  onNewDescriptionChange,
  onToggleNewSecret,
  onToggleNewLiteral,
  onToggleNewForBuild,
  onToggleNewForRuntime,
  onSubmitNew,
  onCancelNew,
  onEditKeyChange,
  onEditValueChange,
  onEditDescriptionChange,
  onSaveEdit,
  onCancelEdit,
  onSecretValueChange,
  onSaveSecret,
  onCancelSecret,
  onStartEdit,
  onStartSecretUpdate,
  onDelete,
  onToggleFlag,
}: Readonly<{
  loading: boolean
  variables: VariableRecord[]
  canOwn: boolean
  showAddForm: boolean
  newKey: string
  newValue: string
  newDescription: string
  newIsSecret: boolean
  newIsLiteral: boolean
  newForBuild: boolean
  newForRuntime: boolean
  addFieldError: string | null
  adding: boolean
  deletingId: string | null
  editingId: string | null
  updatingSecretId: string | null
  editKey: string
  editValue: string
  editDescription: string
  editSaving: boolean
  secretNewValue: string
  secretSaving: boolean
  togglingKey: string | null
  onNewKeyChange: (value: string) => void
  onNewValueChange: (value: string) => void
  onNewDescriptionChange: (value: string) => void
  onToggleNewSecret: () => void
  onToggleNewLiteral: () => void
  onToggleNewForBuild: () => void
  onToggleNewForRuntime: () => void
  onSubmitNew: () => void
  onCancelNew: () => void
  onEditKeyChange: (value: string) => void
  onEditValueChange: (value: string) => void
  onEditDescriptionChange: (value: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onSecretValueChange: (value: string) => void
  onSaveSecret: () => void
  onCancelSecret: () => void
  onStartEdit: (variable: VariableRecord) => void
  onStartSecretUpdate: (variable: VariableRecord) => void
  onDelete: (id: string) => void
  onToggleFlag: (variable: VariableRecord, field: VariableBooleanField) => void
}>) {
  if (loading && variables.length === 0 && !showAddForm) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }

  if (variables.length === 0 && !showAddForm) {
    return (
      <Text style={orgPanelStyles.muted}>
        No variables yet — add keys your compose references with {'{$KEY}'} or{' '}
        {'{$project.KEY}'}. Secrets become /run/secrets/ plus KEY_FILE.
      </Text>
    )
  }

  return (
    <View style={styles.table}>
      <VariablesTableHeader />
      {showAddForm ? (
        <NewVariableRow
          newKey={newKey}
          newValue={newValue}
          newDescription={newDescription}
          newIsSecret={newIsSecret}
          newIsLiteral={newIsLiteral}
          newForBuild={newForBuild}
          newForRuntime={newForRuntime}
          addFieldError={addFieldError}
          adding={adding}
          onKeyChange={onNewKeyChange}
          onValueChange={onNewValueChange}
          onDescriptionChange={onNewDescriptionChange}
          onToggleSecret={onToggleNewSecret}
          onToggleLiteral={onToggleNewLiteral}
          onToggleForBuild={onToggleNewForBuild}
          onToggleForRuntime={onToggleNewForRuntime}
          onSubmit={onSubmitNew}
          onCancel={onCancelNew}
        />
      ) : null}
      {variables.map((variable, index) => (
        <VariableTableRow
          key={variable.id}
          variable={variable}
          canOwn={canOwn}
          zebra={index % 2 === 1}
          isEditing={editingId === variable.id}
          isUpdatingSecret={updatingSecretId === variable.id}
          isDeleting={deletingId === variable.id}
          editKey={editKey}
          editValue={editValue}
          editDescription={editDescription}
          editSaving={editSaving}
          secretNewValue={secretNewValue}
          secretSaving={secretSaving}
          togglingKey={togglingKey}
          onEditKeyChange={onEditKeyChange}
          onEditValueChange={onEditValueChange}
          onEditDescriptionChange={onEditDescriptionChange}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onSecretValueChange={onSecretValueChange}
          onSaveSecret={onSaveSecret}
          onCancelSecret={onCancelSecret}
          onStartEdit={onStartEdit}
          onStartSecretUpdate={onStartSecretUpdate}
          onDelete={onDelete}
          onToggleFlag={onToggleFlag}
        />
      ))}
    </View>
  )
}

function buildEnvFlagsLabel(variable: VariableRecord): string {
  const flags: string[] = []
  if (variable.isSecret) flags.push('secret')
  if (variable.forBuild) flags.push('build')
  if (variable.forRuntime) flags.push('runtime')
  if (variable.isLiteral) flags.push('literal')
  return flags.join(', ')
}

function VariableEnvLine({
  variable,
  isLast,
}: Readonly<{ variable: VariableRecord; isLast: boolean }>) {
  const value = variable.isSecret ? HIDDEN_VALUE_LABEL : variable.value ?? ''
  const flags = buildEnvFlagsLabel(variable)
  return (
    <Text>
      {variable.description ? (
        <Text style={styles.envComment}>{`# ${variable.description}\n`}</Text>
      ) : null}
      <Text style={styles.envCodeText}>{`${variable.key}=`}</Text>
      <Text style={variable.isSecret ? styles.envSecretText : styles.envCodeText}>
        {value}
      </Text>
      {flags ? <Text style={styles.envComment}>{`  # ${flags}`}</Text> : null}
      {isLast ? null : '\n'}
    </Text>
  )
}

/**
 * Read-only `.env`-shaped preview. Rendered with plain `Text` (never a
 * `TextInput`) so there is no way to type into — and accidentally save
 * over — a real encrypted value; secrets always render as
 * {@link HIDDEN_VALUE_LABEL}.
 */
function VariablesEnvView({
  variables,
}: Readonly<{ variables: VariableRecord[] }>) {
  if (variables.length === 0) {
    return (
      <Text style={orgPanelStyles.muted}>
        No variables yet — add keys your compose references with {'{$KEY}'} or{' '}
        {'{$project.KEY}'}. Secrets become /run/secrets/ plus KEY_FILE.
      </Text>
    )
  }

  const bindingOwned = variables.filter(isBindingOwnedVariable)
  const editable = variables.filter((v) => !isBindingOwnedVariable(v))

  return (
    <View style={styles.envWrapper}>
      <Text style={styles.envHint}>
        Read-only preview of how these keys sit in a .env file — secret
        values are masked and can never be revealed here.
      </Text>
      <ScrollView
        style={styles.envBlock}
        nestedScrollEnabled
        accessibilityRole="text"
      >
        <Text style={styles.envText} selectable={Platform.OS === 'web'}>
          {bindingOwned.length > 0 ? (
            <Text style={styles.envComment}>
              {`# From connected databases (locked)\n`}
            </Text>
          ) : null}
          {bindingOwned.map((variable, index) => (
            <VariableEnvLine
              key={variable.id}
              variable={variable}
              isLast={
                index === bindingOwned.length - 1 && editable.length === 0
              }
            />
          ))}
          {bindingOwned.length > 0 && editable.length > 0 ? (
            <Text style={styles.envComment}>{`\n# Operator variables\n`}</Text>
          ) : null}
          {editable.map((variable, index) => (
            <VariableEnvLine
              key={variable.id}
              variable={variable}
              isLast={index === editable.length - 1}
            />
          ))}
        </Text>
      </ScrollView>
    </View>
  )
}

function BindingOwnedVariablesGroup({
  variables,
}: Readonly<{ variables: VariableRecord[] }>) {
  if (variables.length === 0) return null
  return (
    <View style={styles.bindingGroup}>
      <Text style={styles.bindingGroupTitle}>From connected databases</Text>
      <Text style={orgPanelStyles.muted}>
        Locked keys delivered by database connections — edit or disconnect from
        the managed Connect tab or Bound databases panel.
      </Text>
      {variables.map((variable) => (
        <View key={variable.id} style={styles.bindingRow}>
          <Text style={styles.bindingLock}>locked</Text>
          <Text style={styles.bindingKey}>{variable.key}</Text>
          <Text style={styles.bindingValue}>
            {displayVariableValue(variable)}
          </Text>
        </View>
      ))}
    </View>
  )
}

export function VariablesSection({
  orgId,
  parentField,
  title = 'Variables',
  hint = 'Injected into compose at deploy — lower scopes override. Reference with {$KEY} or {$project.KEY}.',
  embedded = false,
  showPresets = true,
  initialShowAdd = false,
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
  /** Common-key preset chips above the add row. */
  showPresets?: boolean
  /** Open the add row on mount (e.g. Settings → Add Variable). */
  initialShowAdd?: boolean
}>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const variablesQuery = useVariables(orgId, parentField)
  const createMutation = useCreateVariable(orgId, parentField)
  const updateMutation = useUpdateVariable(orgId, parentField)
  const deleteMutation = useDeleteVariable(orgId, parentField)

  const variables = variablesQuery.data?.variables ?? []
  const bindingVariables = variables.filter(isBindingOwnedVariable)
  const editableVariables = variables.filter((v) => !isBindingOwnedVariable(v))
  const loading = variablesQuery.isLoading
  const [view, setView] = useState<VariableViewMode>('table')
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(initialShowAdd)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newIsSecret, setNewIsSecret] = useState(false)
  const [newIsLiteral, setNewIsLiteral] = useState(false)
  const [newForBuild, setNewForBuild] = useState(false)
  const [newForRuntime, setNewForRuntime] = useState(true)
  const [addFieldError, setAddFieldError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [updatingSecretId, setUpdatingSecretId] = useState<string | null>(null)
  const [secretNewValue, setSecretNewValue] = useState('')
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  const queryError = resolveVariablesLoadError(
    variablesQuery.isError,
    variablesQuery.error,
  )
  const displayError =
    error ??
    createMutation.actionError ??
    updateMutation.actionError ??
    deleteMutation.actionError ??
    queryError

  const handleDeleteVariable = (id: string) => {
    setError(null)
    deleteMutation.mutate(id, {
      onSuccess: () => {
        if (editingId === id) {
          setEditingId(null)
        }
        if (updatingSecretId === id) {
          setUpdatingSecretId(null)
          setSecretNewValue('')
        }
      },
      onError: () => {
        setError(deleteMutation.actionError ?? 'Failed to delete variable')
      },
    })
  }

  const handleAddVariable = () => {
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

    setAddFieldError(null)
    setError(null)
    createMutation.mutate(
      {
        key: trimmedKey,
        value: trimmedValue,
        isSecret: newIsSecret,
        isLiteral: newIsLiteral,
        forBuild: newForBuild,
        forRuntime: newForRuntime,
        ...(newDescription.trim()
          ? { description: newDescription.trim() }
          : {}),
      },
      {
        onSuccess: () => {
          setNewKey('')
          setNewValue('')
          setNewDescription('')
          setNewIsSecret(false)
          setNewIsLiteral(false)
          setNewForBuild(false)
          setNewForRuntime(true)
          setShowAddForm(false)
        },
        onError: (err) => {
          const message =
            createMutation.actionError ??
            (err instanceof Error ? err.message : 'Failed to create variable')
          if (
            message.includes('binding_key_conflict') ||
            message.includes('binding_owned_variable')
          ) {
            setAddFieldError(
              `${trimmedKey} is provided by a connected database.`,
            )
            setError(null)
            return
          }
          setError(message)
        },
      },
    )
  }

  const startEdit = (variable: VariableRecord) => {
    if (variable.isSecret) {
      return
    }
    setEditingId(variable.id)
    setEditKey(variable.key)
    setEditValue(variable.value ?? '')
    setEditDescription(variable.description ?? '')
    setUpdatingSecretId(null)
    setSecretNewValue('')
  }

  const startSecretUpdate = (variable: VariableRecord) => {
    setUpdatingSecretId(variable.id)
    setSecretNewValue('')
    setEditingId(null)
  }

  const handleSaveEdit = () => {
    if (!editingId) {
      return
    }
    const trimmedKey = editKey.trim()
    if (!trimmedKey) {
      setError('Key is required.')
      return
    }

    setError(null)
    updateMutation.mutate(
      {
        variableId: editingId,
        body: {
          key: trimmedKey,
          value: editValue.trim(),
          description: editDescription.trim() || null,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null)
        },
        onError: () => {
          setError(updateMutation.actionError ?? 'Failed to update variable')
        },
      },
    )
  }

  const handleSaveSecretValue = () => {
    if (!updatingSecretId) {
      return
    }
    if (!secretNewValue) {
      setError('Enter a new secret value.')
      return
    }

    setError(null)
    updateMutation.mutate(
      {
        variableId: updatingSecretId,
        body: { value: secretNewValue },
      },
      {
        onSuccess: () => {
          setUpdatingSecretId(null)
          setSecretNewValue('')
        },
        onError: () => {
          setError(updateMutation.actionError ?? 'Failed to update secret value')
        },
      },
    )
  }

  const handleToggleFlag = (
    variable: VariableRecord,
    field: VariableBooleanField,
  ) => {
    const pendingKey = `${variable.id}:${field}`
    setTogglingKey(pendingKey)
    setError(null)
    const body: { forBuild?: boolean; forRuntime?: boolean; isLiteral?: boolean } =
      {}
    body[field] = !variable[field]
    updateMutation.mutate(
      { variableId: variable.id, body },
      {
        onSuccess: () => {
          setTogglingKey((current) => (current === pendingKey ? null : current))
        },
        onError: () => {
          setError(updateMutation.actionError ?? 'Failed to update variable')
          setTogglingKey((current) => (current === pendingKey ? null : current))
        },
      },
    )
  }

  const editSaving = updateMutation.isPending && editingId !== null
  const secretSaving = updateMutation.isPending && updatingSecretId !== null
  const deletingId =
    deleteMutation.isPending && typeof deleteMutation.variables === 'string'
      ? deleteMutation.variables
      : null
  const adding = createMutation.isPending

  const body = (
    <>
      {showPresets && canOwn && view === 'table' ? (
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

      <View style={styles.toolbarRow}>
        <ViewModeTabs value={view} onChange={setView} />
        {canOwn && view === 'table' ? (
          <Pressable
            style={styles.primaryButton}
            onPress={() => setShowAddForm((current) => !current)}
          >
            <Text style={styles.primaryButtonText}>
              {showAddForm ? 'Cancel' : '+ Add variable'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {displayError ? <Text style={orgPanelStyles.error}>{displayError}</Text> : null}

      {view === 'table' ? (
        <>
          <BindingOwnedVariablesGroup variables={bindingVariables} />
          <VariablesTable
            loading={loading}
            variables={editableVariables}
            canOwn={canOwn}
            showAddForm={showAddForm && canOwn}
            newKey={newKey}
            newValue={newValue}
            newDescription={newDescription}
            newIsSecret={newIsSecret}
            newIsLiteral={newIsLiteral}
            newForBuild={newForBuild}
            newForRuntime={newForRuntime}
            addFieldError={addFieldError}
            adding={adding}
            deletingId={deletingId}
            editingId={editingId}
            updatingSecretId={updatingSecretId}
            editKey={editKey}
            editValue={editValue}
            editDescription={editDescription}
            editSaving={editSaving}
            secretNewValue={secretNewValue}
            secretSaving={secretSaving}
            togglingKey={togglingKey}
            onNewKeyChange={(text) => {
              setNewKey(text)
              setAddFieldError(null)
            }}
            onNewValueChange={setNewValue}
            onNewDescriptionChange={setNewDescription}
            onToggleNewSecret={() => setNewIsSecret((current) => !current)}
            onToggleNewLiteral={() => setNewIsLiteral((current) => !current)}
            onToggleNewForBuild={() => setNewForBuild((current) => !current)}
            onToggleNewForRuntime={() => setNewForRuntime((current) => !current)}
            onSubmitNew={handleAddVariable}
            onCancelNew={() => setShowAddForm(false)}
            onEditKeyChange={setEditKey}
            onEditValueChange={setEditValue}
            onEditDescriptionChange={setEditDescription}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => setEditingId(null)}
            onSecretValueChange={setSecretNewValue}
            onSaveSecret={handleSaveSecretValue}
            onCancelSecret={() => {
              setUpdatingSecretId(null)
              setSecretNewValue('')
            }}
            onStartEdit={startEdit}
            onStartSecretUpdate={startSecretUpdate}
            onDelete={handleDeleteVariable}
            onToggleFlag={handleToggleFlag}
          />
        </>
      ) : (
        <VariablesEnvView variables={variables} />
      )}
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
  bindingGroup: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.bgSecondary,
  },
  bindingGroupTitle: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  bindingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  bindingLock: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bindingKey: {
    color: colors.command,
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  bindingValue: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    flexShrink: 1,
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
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  viewTabList: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  viewTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewTabActive: {
    borderBottomColor: chrome.accent,
  },
  viewTabText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  viewTabTextActive: {
    color: colors.text,
    fontWeight: '700',
  },
  primaryButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: chrome.bgActive,
  },
  primaryButtonText: {
    color: chrome.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 11,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.borderArea,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: colors.borderArea,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: spacing.sm,
  },
  rowEven: {
    backgroundColor: colors.bgInset,
  },
  rowNew: {
    backgroundColor: colors.bgActive,
  },
  headerRow: {
    alignItems: 'center',
    borderTopWidth: 0,
    backgroundColor: colors.bgSecondary,
    paddingVertical: spacing.xs,
  },
  headerCell: {
    color: colors.textLabel,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headerCellCenter: {
    textAlign: 'center',
  },
  colType: {
    width: 92,
    flexShrink: 0,
    paddingTop: 2,
  },
  colName: {
    flex: 1.2,
    minWidth: 130,
    gap: 4,
  },
  colValue: {
    flex: 1.5,
    minWidth: 140,
    gap: 4,
  },
  colBuild: {
    width: 56,
    flexShrink: 0,
    paddingTop: 2,
  },
  colRuntime: {
    width: 68,
    flexShrink: 0,
    paddingTop: 2,
  },
  colCenter: {
    alignItems: 'center',
  },
  colActions: {
    width: 120,
    flexShrink: 0,
  },
  cellStack: {
    gap: 4,
  },
  monoKey: {
    color: colors.accent,
    fontSize: 13,
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  descriptionText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  valueText: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
    paddingTop: 6,
  },
  valueSecretText: {
    color: colors.pending,
  },
  cellInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    borderRadius: 6,
    minHeight: 32,
  },
  cellInputError: {
    borderColor: colors.error,
  },
  cellMultiline: {
    minHeight: 32,
    textAlignVertical: 'top',
  },
  checkbox: {
    width: 18,
    height: 18,
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
  checkboxDisabled: {
    opacity: 0.6,
  },
  checkboxMark: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  checkboxSpinner: {
    transform: [{ scale: 0.6 }],
  },
  labeledCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  labeledCheckboxText: {
    color: colors.textBody,
    fontSize: 11,
    fontWeight: '600',
  },
  flagChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  flagChipActive: {
    borderColor: colors.pending,
    backgroundColor: colors.bgActive,
  },
  flagChipText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  flagChipTextActive: {
    color: colors.pending,
  },
  actionsCell: {
    width: 120,
    flexShrink: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: 4,
  },
  actionLink: {
    paddingVertical: 2,
  },
  actionLinkText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  actionLinkTextPrimary: {
    color: chrome.accent,
  },
  actionLinkTextDanger: {
    color: colors.errorText,
  },
  envWrapper: {
    gap: spacing.sm,
  },
  envHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  envBlock: {
    ...orgPanelStyles.commandCodeBlock,
    maxHeight: 420,
  },
  envText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  envCodeText: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
  envSecretText: {
    color: colors.pending,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  envComment: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },
})
