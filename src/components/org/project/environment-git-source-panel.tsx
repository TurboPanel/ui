import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Button,
  ButtonRow,
  InlineNotice,
  SectionPanel,
  SettingRow,
  TextField,
  Toggle,
} from '@/components/ui'
import {
  patchEnvironmentSourceBinding,
  readEnvironmentSourceBindings,
  type EnvironmentSourceBinding,
  type EnvironmentSourcePatch,
} from '@/lib/compose/environment-source-branch'
import type { RepositoryRecord } from '@/lib/instance-api'
import { useRepositories, useUpdateRepository } from '@/lib/queries/releases'
import { repositoryLabel } from '@/lib/repository-label'
import { colors, spacing } from '@/lib/theme'

/** Plain-language origin of the branch an environment builds. */
function branchOriginLabel(binding: EnvironmentSourceBinding): string {
  if (binding.branchFrom === 'environment') return 'set for this environment'
  if (binding.branchFrom === 'project') return 'from the project'
  if (binding.branchFrom === 'repository') return "the repository's default branch"
  return 'no branch set'
}

function branchSummary(binding: EnvironmentSourceBinding): string {
  if (binding.branch === null) {
    return 'No branch is set, so a push cannot deploy this service. Name one below.'
  }
  const pushes = binding.deployOnPush
    ? 'A push to it deploys this environment.'
    : 'Pushes do not deploy this environment; deploy it by hand.'
  return `Builds ${binding.branch} (${branchOriginLabel(binding)}). ${pushes}`
}

function BindingRow({
  binding,
  repository,
  canEdit,
  saving,
  onPatch,
}: Readonly<{
  binding: EnvironmentSourceBinding
  repository: RepositoryRecord | undefined
  canEdit: boolean
  saving: boolean
  onPatch: (patch: EnvironmentSourcePatch) => void
}>) {
  const [draft, setDraft] = useState(
    binding.branchFrom === 'environment' ? (binding.branch ?? '') : ''
  )
  const editable = canEdit && binding.editable
  const dirty =
    draft.trim() !== (binding.branchFrom === 'environment' ? (binding.branch ?? '') : '')

  return (
    <View style={styles.binding}>
      <Text style={styles.serviceName}>
        {binding.serviceName}
        {repository ? (
          <Text style={panelStyles.muted}>{`  ·  ${repositoryLabel(repository)}`}</Text>
        ) : null}
      </Text>
      <Text style={panelStyles.muted}>{branchSummary(binding)}</Text>
      {binding.blockedReason ? (
        <Text style={panelStyles.muted}>{binding.blockedReason}</Text>
      ) : null}
      <TextField
        label="Branch for this environment"
        value={draft}
        onChangeText={setDraft}
        editable={editable && !saving}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={binding.inheritedBranch ?? 'main'}
        hint={
          binding.inheritedBranch
            ? `Leave empty to follow ${binding.inheritedBranch}.`
            : 'The project and the repository name no branch; set one here.'
        }
      />
      <ButtonRow>
        <Button
          label="Save branch"
          size="sm"
          disabled={!editable || !dirty}
          busy={saving}
          busyLabel="Saving…"
          onPress={() => onPatch({ branch: draft })}
        />
        {binding.branchFrom === 'environment' ? (
          <Button
            label="Follow the project"
            size="sm"
            variant="secondary"
            disabled={!editable || saving}
            onPress={() => {
              setDraft('')
              onPatch({ branch: null })
            }}
          />
        ) : null}
      </ButtonRow>
      <SettingRow
        label="Deploy on push"
        description="When this environment's branch is pushed, deploy it automatically."
      >
        <Toggle
          value={binding.deployOnPush}
          onValueChange={(next) => onPatch({ deployOnPush: next })}
          disabled={!editable}
          busy={saving}
          accessibilityLabel={`Deploy ${binding.serviceName} when its branch is pushed`}
        />
      </SettingRow>
    </View>
  )
}

/** Repositories whose own auto-deploy switch is off: no push deploys any environment. */
function DisarmedRepositoryNotice({
  repositories,
  canEdit,
  turnOn,
  busy,
}: Readonly<{
  repositories: readonly RepositoryRecord[]
  canEdit: boolean
  turnOn: (repositoryId: string) => void
  busy: boolean
}>) {
  if (repositories.length === 0) return null
  return (
    <>
      {repositories.map((repository) => (
        <InlineNotice
          key={repository.id}
          tone="warning"
          title={`Auto-deploy is off for ${repositoryLabel(repository)}`}
          body="Until it is on, a push deploys none of this repository's environments, whatever branch they build."
          actions={
            canEdit ? (
              <Button
                label="Turn on"
                size="sm"
                busy={busy}
                busyLabel="Turning on…"
                onPress={() => turnOn(repository.id)}
              />
            ) : undefined
          }
        />
      ))}
    </>
  )
}

/**
 * Which branch of each connected repository this environment builds, and
 * whether a push to it deploys.
 *
 * The branch is the environment's own — saved as a small override in its
 * compose document on top of the project's — so one project can build `main` in
 * production and `staging` in staging. The repository's auto-deploy switch is
 * still the one that arms the webhook for every environment, so it is surfaced
 * here when it is off rather than left for the operator to discover.
 */
export function EnvironmentGitSourcePanel({
  orgId,
  environmentId,
  projectCompose,
  environmentCompose,
  canEdit,
}: Readonly<{
  orgId: string
  environmentId: string
  projectCompose: unknown
  environmentCompose: unknown
  canEdit: boolean
}>) {
  const repositoriesQuery = useRepositories(orgId)
  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  )
  const persist = usePersistEnvironmentCompose(orgId, environmentId)
  const updateRepository = useUpdateRepository(orgId)
  const [savingService, setSavingService] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const bindings = useMemo(
    () =>
      readEnvironmentSourceBindings({
        projectCompose,
        environmentCompose,
        repositoryDefaultBranch: (sourceId) =>
          repositories.find((row) => row.id === sourceId)?.defaultBranch ?? null,
      }),
    [projectCompose, environmentCompose, repositories]
  )
  if (bindings.length === 0) return null

  const disarmed = repositories.filter(
    (row) => row.autoDeploy === 'disabled' && bindings.some((b) => b.sourceId === row.id)
  )

  const save = async (serviceName: string, patch: EnvironmentSourcePatch) => {
    setError(null)
    setSavingService(serviceName)
    const next = patchEnvironmentSourceBinding({
      projectCompose,
      environmentCompose,
      serviceName,
      patch,
    })
    const result = await persist.run(next)
    setSavingService(null)
    if (!result.ok) setError(persist.actionError ?? 'Failed to save the branch')
  }

  return (
    <SectionPanel
      title="Git branch"
      hint="The branch of each connected repository this environment builds, and whether a push to it deploys."
    >
      <DisarmedRepositoryNotice
        repositories={disarmed}
        canEdit={canEdit}
        busy={updateRepository.isPending}
        turnOn={(repositoryId) => {
          void updateRepository.run({ repositoryId, patch: { autoDeploy: 'immediate' } })
        }}
      />
      {updateRepository.actionError ? (
        <Text style={panelStyles.error}>{updateRepository.actionError}</Text>
      ) : null}
      {bindings.map((binding) => (
        <BindingRow
          key={binding.serviceName}
          binding={binding}
          repository={repositories.find((row) => row.id === binding.sourceId)}
          canEdit={canEdit}
          saving={savingService === binding.serviceName}
          onPatch={(patch) => {
            void save(binding.serviceName, patch)
          }}
        />
      ))}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  binding: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  serviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
})
