import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createEnvironment,
  deleteEnvironment,
  fetchVisibleEnvironments,
  isForbiddenError,
  updateEnvironment,
  type EnvironmentRecord,
} from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 ._-]+$/
const DEFAULT_ENVIRONMENT_NAME = 'Production'

function environmentLabel(environment: EnvironmentRecord): string {
  return environment.displayName?.trim() || 'Unnamed environment'
}

function resolveSelectedId(
  previous: string | null,
  environments: EnvironmentRecord[],
): string | null {
  if (previous && environments.some((env) => env.id === previous)) {
    return previous
  }
  return environments[0]?.id ?? null
}

function validateEnvironmentName(name: string): string | null {
  if (!name) {
    return 'Name is required.'
  }
  if (name.length > 255) {
    return 'Name must be 255 characters or fewer.'
  }
  if (!DISPLAY_NAME_PATTERN.test(name)) {
    return 'Name may only contain letters, numbers, spaces, dots, underscores, and hyphens.'
  }
  return null
}

function EnvironmentTabs({
  environments,
  selectedId,
  onSelect,
}: Readonly<{
  environments: EnvironmentRecord[]
  selectedId: string | null
  onSelect: (id: string) => void
}>) {
  if (environments.length <= 1) {
    return null
  }
  return (
    <View style={styles.tabBar}>
      {environments.map((environment) => {
        const active = environment.id === selectedId
        return (
          <Pressable
            key={environment.id}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onSelect(environment.id)}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {environmentLabel(environment)}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function EnvironmentRenameForm({
  value,
  saving,
  onChange,
  onSave,
  onCancel,
}: Readonly<{
  value: string
  saving: boolean
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Environment name"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
        maxLength={255}
      />
      <View style={styles.inlineActions}>
        <Pressable
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          disabled={saving}
          onPress={onSave}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? 'Saving…' : 'Save name'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function EnvironmentCreateForm({
  value,
  fieldError,
  creating,
  onChange,
  onSubmit,
  onCancel,
}: Readonly<{
  value: string
  fieldError: string | null
  creating: boolean
  onChange: (value: string) => void
  onSubmit: () => void
  onCancel: () => void
}>) {
  return (
    <View style={styles.inlineForm}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="e.g. staging"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!creating}
        maxLength={255}
      />
      {fieldError ? <Text style={orgPanelStyles.error}>{fieldError}</Text> : null}
      <View style={styles.inlineActions}>
        <Pressable
          style={[styles.primaryButton, creating && styles.buttonDisabled]}
          disabled={creating}
          onPress={onSubmit}
        >
          <Text style={styles.primaryButtonText}>
            {creating ? 'Creating…' : 'Create environment'}
          </Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onCancel}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function deleteButtonLabel(deleting: boolean, armed: boolean): string {
  if (deleting) {
    return 'Deleting…'
  }
  if (armed) {
    return 'Confirm delete'
  }
  return 'Delete'
}

function EnvironmentDeleteControl({
  deleteArmed,
  deleting,
  onConfirm,
  onToggleArm,
}: Readonly<{
  deleteArmed: boolean
  deleting: boolean
  onConfirm: () => void
  onToggleArm: () => void
}>) {
  return (
    <>
      <Pressable
        style={[styles.secondaryButton, deleting && styles.buttonDisabled]}
        disabled={deleting}
        onPress={deleteArmed ? onConfirm : onToggleArm}
      >
        <Text style={styles.deleteButtonText}>
          {deleteButtonLabel(deleting, deleteArmed)}
        </Text>
      </Pressable>
      {deleteArmed ? (
        <Pressable style={styles.secondaryButton} onPress={onToggleArm}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      ) : null}
    </>
  )
}

function EnvironmentToolbar({
  activeEnvironment,
  canOwn,
  canDelete,
  onRename,
  onAdd,
  deleteArmed,
  deleting,
  onConfirmDelete,
  onToggleArm,
}: Readonly<{
  activeEnvironment: EnvironmentRecord
  canOwn: boolean
  canDelete: boolean
  onRename: () => void
  onAdd: () => void
  deleteArmed: boolean
  deleting: boolean
  onConfirmDelete: () => void
  onToggleArm: () => void
}>) {
  return (
    <View style={styles.toolbar}>
      <Text style={styles.activeName}>{environmentLabel(activeEnvironment)}</Text>
      {canOwn ? (
        <View style={styles.toolbarActions}>
          <Pressable style={styles.secondaryButton} onPress={onRename}>
            <Text style={styles.secondaryButtonText}>Rename</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onAdd}>
            <Text style={styles.secondaryButtonText}>New environment</Text>
          </Pressable>
          {canDelete ? (
            <EnvironmentDeleteControl
              deleteArmed={deleteArmed}
              deleting={deleting}
              onConfirm={onConfirmDelete}
              onToggleArm={onToggleArm}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

export function ProjectEnvironmentsSection({
  orgId,
  projectId,
}: Readonly<{
  orgId: string
  projectId: string
}>) {
  const { handleUnauthorized } = useAuth()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const [environments, setEnvironments] = useState<EnvironmentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Only ever auto-provision the default environment once per project (survives
  // React StrictMode's double effect invocation in development).
  const provisionAttemptedFor = useRef<string | null>(null)

  const reload = async (): Promise<EnvironmentRecord[]> => {
    const result = await fetchVisibleEnvironments(projectId)
    return result.environments
  }

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        let envs = await reload()
        if (
          envs.length === 0 &&
          canOwn &&
          provisionAttemptedFor.current !== projectId
        ) {
          provisionAttemptedFor.current = projectId
          await createEnvironment({
            projectId,
            displayName: DEFAULT_ENVIRONMENT_NAME,
          })
          envs = await reload()
        }
        if (cancelled) {
          return
        }
        setEnvironments(envs)
        setSelectedId((previous) => resolveSelectedId(previous, envs))
      } catch (err) {
        if (cancelled) {
          return
        }
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setError(
          err instanceof Error ? err.message : 'Failed to load environments',
        )
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
  }, [projectId, canOwn, handleUnauthorized])

  const activeEnvironment =
    environments.find((env) => env.id === selectedId) ?? null

  const selectEnvironment = (id: string) => {
    setSelectedId(id)
    setRenaming(false)
    setShowCreate(false)
    setDeleteArmed(false)
  }

  const startRename = () => {
    if (!activeEnvironment) {
      return
    }
    setRenameValue(activeEnvironment.displayName?.trim() ?? '')
    setRenaming(true)
    setShowCreate(false)
    setDeleteArmed(false)
  }

  const saveRename = async () => {
    if (!activeEnvironment) {
      return
    }
    const trimmed = renameValue.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setError(validation)
      return
    }
    setRenameSaving(true)
    setError(null)
    try {
      await updateEnvironment(activeEnvironment.id, { displayName: trimmed })
      setEnvironments((current) =>
        current.map((env) =>
          env.id === activeEnvironment.id
            ? { ...env, displayName: trimmed }
            : env,
        ),
      )
      setRenaming(false)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to rename environment')
    } finally {
      setRenameSaving(false)
    }
  }

  const submitCreate = async () => {
    const trimmed = createName.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setCreateError(validation)
      return
    }
    setCreating(true)
    setCreateError(null)
    setError(null)
    try {
      const result = await createEnvironment({ projectId, displayName: trimmed })
      const envs = await reload()
      setEnvironments(envs)
      setSelectedId(result.id)
      setCreateName('')
      setShowCreate(false)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create environment',
      )
    } finally {
      setCreating(false)
    }
  }

  const deleteActive = async () => {
    if (!activeEnvironment) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await deleteEnvironment(activeEnvironment.id)
      const envs = await reload()
      setEnvironments(envs)
      setSelectedId(envs[0]?.id ?? null)
      setDeleteArmed(false)
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to delete environment')
    } finally {
      setDeleting(false)
    }
  }

  let content
  if (loading && environments.length === 0) {
    content = <Text style={orgPanelStyles.muted}>Loading environments…</Text>
  } else if (!activeEnvironment) {
    content = (
      <Text style={orgPanelStyles.muted}>
        No environments yet.
        {canOwn ? ' Create one to configure deploys.' : ''}
      </Text>
    )
  } else {
    content = (
      <>
        <EnvironmentTabs
          environments={environments}
          selectedId={selectedId}
          onSelect={selectEnvironment}
        />
        {renaming ? (
          <EnvironmentRenameForm
            value={renameValue}
            saving={renameSaving}
            onChange={setRenameValue}
            onSave={() => void saveRename()}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <EnvironmentToolbar
            activeEnvironment={activeEnvironment}
            canOwn={canOwn}
            canDelete={environments.length > 1}
            onRename={startRename}
            onAdd={() => {
              setShowCreate(true)
              setDeleteArmed(false)
            }}
            deleteArmed={deleteArmed}
            deleting={deleting}
            onConfirmDelete={() => void deleteActive()}
            onToggleArm={() => setDeleteArmed((current) => !current)}
          />
        )}
        {showCreate && canOwn ? (
          <EnvironmentCreateForm
            value={createName}
            fieldError={createError}
            creating={creating}
            onChange={(value) => {
              setCreateName(value)
              setCreateError(null)
            }}
            onSubmit={() => void submitCreate()}
            onCancel={() => {
              setShowCreate(false)
              setCreateName('')
              setCreateError(null)
            }}
          />
        ) : null}
        <EnvironmentDetailBody
          key={activeEnvironment.id}
          orgId={orgId}
          projectId={projectId}
          environmentId={activeEnvironment.id}
          embedded
        />
      </>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Environments</Text>
      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}
      {content}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    paddingBottom: spacing.xs,
  },
  tab: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tabActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: chrome.accent,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  activeName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  inlineForm: {
    gap: spacing.sm,
  },
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: chrome.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: chrome.onAccent,
    fontSize: 14,
    fontWeight: '700',
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
  deleteButtonText: {
    color: colors.error,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
})
