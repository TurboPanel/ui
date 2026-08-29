import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { EnvironmentDetailBody } from '@/components/org/environment-detail-section'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  ConfirmButton,
  EmptyState,
  LoadingState,
  TextField,
} from '@/components/ui'
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
      <TextField
        label="Environment name"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
      />
      <ButtonRow>
        <Button
          label="Save name"
          busyLabel="Saving…"
          variant="primary"
          busy={saving}
          onPress={onSave}
        />
        <Button label="Cancel" variant="secondary" size="sm" onPress={onCancel} />
      </ButtonRow>
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
      <TextField
        label="Environment name"
        hint="e.g. staging"
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!creating}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        error={fieldError}
      />
      <ButtonRow>
        <Button
          label="Create environment"
          busyLabel="Creating…"
          variant="primary"
          busy={creating}
          onPress={onSubmit}
        />
        <Button label="Cancel" variant="secondary" size="sm" onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

function EnvironmentToolbar({
  activeEnvironment,
  canOwn,
  canDelete,
  onRename,
  onAdd,
  deleting,
  onConfirmDelete,
}: Readonly<{
  activeEnvironment: EnvironmentRecord
  canOwn: boolean
  canDelete: boolean
  onRename: () => void
  onAdd: () => void
  deleting: boolean
  onConfirmDelete: () => void
}>) {
  return (
    <View style={styles.toolbar}>
      <Text style={styles.activeName}>{environmentLabel(activeEnvironment)}</Text>
      {canOwn ? (
        <View style={styles.toolbarActions}>
          <Button label="Rename" variant="secondary" size="sm" onPress={onRename} />
          <Button
            label="New environment"
            variant="secondary"
            size="sm"
            onPress={onAdd}
          />
          {canDelete ? (
            <ConfirmButton
              key={activeEnvironment.id}
              label={deleting ? 'Deleting…' : 'Delete'}
              confirmLabel="Confirm delete"
              prompt="Delete this environment?"
              busy={deleting}
              onConfirm={onConfirmDelete}
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
  }

  const startRename = () => {
    if (!activeEnvironment) return
    setRenameValue(activeEnvironment.name?.trim() ?? '')
    setRenaming(true)
    setShowCreate(false)
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
    }
  }

  let content
  if (loading && environments.length === 0) {
    content = <LoadingState label="Loading environments…" />
  } else if (!activeEnvironment) {
    content = (
      <EmptyState
        title={`No environments yet.${canOwn ? ' Create one to configure deploys.' : ''}`}
      />
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
            }}
            deleting={deleteEnvironment.isPending}
            onConfirmDelete={() => void deleteActive()}
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
        <Text style={panelStyles.error}>{error ?? queryError}</Text>
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
    borderRadius: 8,
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
})
