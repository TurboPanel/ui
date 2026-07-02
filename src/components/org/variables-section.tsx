import { useEffect, useState } from 'react'
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
import { colors, spacing } from '@/lib/theme'

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

export function VariablesSection({
  orgId,
  parentField,
}: {
  orgId: string
  parentField: VariableParentFilter
}) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [variables, setVariables] = useState<VariableRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newIsSecret, setNewIsSecret] = useState(false)
  const [addFieldError, setAddFieldError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')
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
    if (!newValue && !newIsSecret) {
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
        value: newValue,
        isSecret: newIsSecret,
      } satisfies CreateVariableBody)
      setNewKey('')
      setNewValue('')
      setNewIsSecret(false)
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
        value: editValue,
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

  const inputStyle = (hasError: boolean) => [
    Platform.OS === 'web'
      ? {
          ...webInputStyle,
          borderColor: hasError ? colors.error : colors.border,
        }
      : styles.input,
    hasError && Platform.OS !== 'web' && styles.inputError,
  ]

  return (
    <SectionPanel title="Variables" hint="Environment variables">
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
        <View style={styles.inlineForm}>
          <View style={styles.field}>
            <Text style={styles.label}>Key *</Text>
            <TextInput
              style={inputStyle(Boolean(addFieldError))}
              value={newKey}
              onChangeText={(t) => {
                setNewKey(t)
                setAddFieldError(null)
              }}
              placeholder="e.g. DATABASE_URL"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!adding}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Value</Text>
            <TextInput
              style={inputStyle(false)}
              value={newValue}
              onChangeText={setNewValue}
              placeholder={
                newIsSecret ? 'Secret value (write-only)' : 'Plaintext value'
              }
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!adding}
              secureTextEntry={newIsSecret}
            />
          </View>
          <Pressable
            style={styles.toggleRow}
            onPress={() => setNewIsSecret((current) => !current)}
          >
            <View
              style={[
                styles.checkbox,
                newIsSecret && styles.checkboxChecked,
              ]}
            >
              {newIsSecret ? (
                <Text style={styles.checkboxMark}>✓</Text>
              ) : null}
            </View>
            <Text style={styles.toggleLabel}>Secret</Text>
          </Pressable>
          {addFieldError ? (
            <Text style={styles.fieldError}>{addFieldError}</Text>
          ) : null}
          <Pressable
            style={[styles.submitButton, adding && styles.buttonDisabled]}
            disabled={adding}
            onPress={() => void handleAddVariable()}
          >
            <Text style={styles.submitButtonText}>
              {adding ? 'Adding…' : 'Add variable'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {loading && variables.length === 0 ? (
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      ) : variables.length === 0 ? (
        <Text style={orgPanelStyles.muted}>No variables yet.</Text>
      ) : (
        <View style={styles.list}>
          {variables.map((variable) => (
            <View key={variable.id} style={orgPanelStyles.detailCard}>
              {editingId === variable.id && !variable.isSecret ? (
                <View style={styles.inlineForm}>
                  <View style={styles.field}>
                    <Text style={styles.label}>Key</Text>
                    <TextInput
                      style={inputStyle(false)}
                      value={editKey}
                      onChangeText={setEditKey}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!editSaving}
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.label}>Value</Text>
                    <TextInput
                      style={inputStyle(false)}
                      value={editValue}
                      onChangeText={setEditValue}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!editSaving}
                    />
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      style={[
                        styles.submitButton,
                        editSaving && styles.buttonDisabled,
                      ]}
                      disabled={editSaving}
                      onPress={() => void handleSaveEdit()}
                    >
                      <Text style={styles.submitButtonText}>
                        {editSaving ? 'Saving…' : 'Save'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => setEditingId(null)}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : updatingSecretId === variable.id ? (
                <View style={styles.inlineForm}>
                  <Text style={styles.monoKey}>{variable.key}</Text>
                  <View style={styles.field}>
                    <Text style={styles.label}>New value</Text>
                    <TextInput
                      style={inputStyle(false)}
                      value={secretNewValue}
                      onChangeText={setSecretNewValue}
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
                      style={[
                        styles.submitButton,
                        secretSaving && styles.buttonDisabled,
                      ]}
                      disabled={secretSaving}
                      onPress={() => void handleSaveSecretValue()}
                    >
                      <Text style={styles.submitButtonText}>
                        {secretSaving ? 'Saving…' : 'Save secret'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.secondaryButton}
                      onPress={() => {
                        setUpdatingSecretId(null)
                        setSecretNewValue('')
                      }}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
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
                      <View style={styles.rowActions}>
                        {variable.isSecret ? (
                          <Pressable
                            style={styles.secondaryButton}
                            onPress={() => startSecretUpdate(variable)}
                          >
                            <Text style={styles.secondaryButtonText}>
                              Update value
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            style={styles.secondaryButton}
                            onPress={() => startEdit(variable)}
                          >
                            <Text style={styles.secondaryButtonText}>
                              Edit
                            </Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[
                            styles.secondaryButton,
                            deleting.has(variable.id) && styles.buttonDisabled,
                          ]}
                          disabled={deleting.has(variable.id)}
                          onPress={() => void handleDeleteVariable(variable.id)}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {deleting.has(variable.id)
                              ? 'Deleting…'
                              : 'Delete'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  <Text style={orgPanelStyles.detailLine}>
                    <Text style={orgPanelStyles.detailLabel}>Value: </Text>
                    {displayVariableValue(variable)}
                  </Text>
                </>
              )}
            </View>
          ))}
        </View>
      )}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
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
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgActive,
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: colors.accent,
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
    borderColor: colors.accent,
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
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
