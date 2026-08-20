import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  useCreateEnvironment,
  useDeleteEnvironment,
  useEnvironments,
  useUpdateEnvironment,
} from '@/lib/queries'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { validateEnvironmentName } from '@/lib/environment-validation'
import { orEmptyArray } from '@/lib/or-empty-array'
import { DISPLAY_NAME_MAX_LENGTH } from '@/lib/display-name'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { useCan } from '@/lib/query-client'
import { chrome, colors, spacing } from '@/lib/theme'

function environmentLabel(environment: EnvironmentRecord): string {
  return environment.name?.trim() || 'Unnamed environment'
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
        maxLength={DISPLAY_NAME_MAX_LENGTH}
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
        maxLength={DISPLAY_NAME_MAX_LENGTH}
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
  embedDetail = true,
}: Readonly<{
  orgId: string
  projectId: string
  embedDetail?: boolean
}>) {
  const canOwn = useCan('organization', orgId, 'organization:own')
  const {
    defaultEnvironmentName,
    isLoading: defaultNameLoading,
  } = useOrgDefaultEnvironmentName(orgId)

  const environmentsQuery = useEnvironments(orgId, projectId)
  const createEnvironment = useCreateEnvironment(orgId)
  const environments = orEmptyArray(environmentsQuery.data?.environments)
  const loading = environmentsQuery.isLoading || defaultNameLoading

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [deleteArmed, setDeleteArmed] = useState(false)

  const provisionAttemptedFor = useRef<string | null>(null)

  const activeEnvironment =
    environments.find((env) => env.id === selectedId) ?? null

  const updateEnvironment = useUpdateEnvironment(
    orgId,
    activeEnvironment?.id ?? '',
  )
  const deleteEnvironment = useDeleteEnvironment(orgId)

  useEffect(() => {
    setSelectedId((previous) => resolveSelectedId(previous, environments))
  }, [environments])

  useEffect(() => {
    if (defaultNameLoading || environmentsQuery.isLoading) return
    if (
      environments.length === 0 &&
      canOwn &&
      provisionAttemptedFor.current !== projectId
    ) {
      provisionAttemptedFor.current = projectId
      createEnvironment
        .run({
          projectId,
          name: defaultEnvironmentName,
        })
        .then((result) => {
          if (!result.ok && createEnvironment.actionError) {
            setError(createEnvironment.actionError)
          }
        })
    }
  }, [
    environments.length,
    canOwn,
    projectId,
    defaultEnvironmentName,
    defaultNameLoading,
    environmentsQuery.isLoading,
    createEnvironment,
  ])

  const queryError =
    environmentsQuery.error instanceof Error
      ? environmentsQuery.error.message
      : null

  const selectEnvironment = (id: string) => {
    setSelectedId(id)
    setRenaming(false)
    setShowCreate(false)
    setDeleteArmed(false)
  }

  const startRename = () => {
    if (!activeEnvironment) return
    setRenameValue(activeEnvironment.name?.trim() ?? '')
    setRenaming(true)
    setShowCreate(false)
    setDeleteArmed(false)
  }

  const saveRename = async () => {
    if (!activeEnvironment) return
    const trimmed = renameValue.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setError(validation)
      return
    }
    setError(null)
    const result = await updateEnvironment.run({ name: trimmed })
    if (!result.ok) {
      if (updateEnvironment.actionError) {
        setError(updateEnvironment.actionError)
      }
      return
    }
    setRenaming(false)
  }

  const submitCreate = async () => {
    const trimmed = createName.trim()
    const validation = validateEnvironmentName(trimmed)
    if (validation) {
      setCreateError(validation)
      return
    }
    setCreateError(null)
    setError(null)
    const result = await createEnvironment.run({
      projectId,
      name: trimmed,
    })
    if (!result.ok) {
      if (createEnvironment.actionError) {
        setCreateError(createEnvironment.actionError)
      }
      return
    }
    setSelectedId(result.value.id)
    setCreateName('')
    setShowCreate(false)
  }

  const deleteActive = async () => {
    if (!activeEnvironment) return
    setError(null)
    const result = await deleteEnvironment.run(activeEnvironment.id)
    if (!result.ok) {
      if (deleteEnvironment.actionError) {
        setError(deleteEnvironment.actionError)
      }
      return
    }
    setDeleteArmed(false)
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
            saving={updateEnvironment.isPending}
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
            deleting={deleteEnvironment.isPending}
            onConfirmDelete={() => void deleteActive()}
            onToggleArm={() => setDeleteArmed((current) => !current)}
          />
        )}
        {showCreate && canOwn ? (
          <EnvironmentCreateForm
            value={createName}
            fieldError={createError}
            creating={createEnvironment.isPending}
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
        {embedDetail ? (
          <EnvironmentDetailBody
            key={activeEnvironment.id}
            orgId={orgId}
            projectId={projectId}
            environmentId={activeEnvironment.id}
            embedded
          />
        ) : null}
      </>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Environments</Text>
      {error ?? queryError ? (
        <Text style={orgPanelStyles.error}>{error ?? queryError}</Text>
      ) : null}
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
