import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { usePersistEnvironmentCompose } from '@/components/org/compose-persistence'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SettingRow, TextField, Toggle } from '@/components/ui'
import { Section } from '@/components/ui/v4/section'
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
import { pushDeployLine } from '@/lib/v4/push-deploy'

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
  return `Builds ${binding.branch} (${branchOriginLabel(binding)}).`
}

function BindingRow({
  binding,
  environmentName,
  repository,
  canEdit,
  saving,
  turningOn,
  onTurnOnRepository,
  onPatch,
}: Readonly<{
  binding: EnvironmentSourceBinding
  environmentName: string
  repository: RepositoryRecord | undefined
  canEdit: boolean
  saving: boolean
  turningOn: boolean
  onTurnOnRepository: (repositoryId: string) => void
  onPatch: (patch: EnvironmentSourcePatch) => void
}>) {
  const [draft, setDraft] = useState(
    binding.branchFrom === 'environment' ? (binding.branch ?? '') : ''
  )
  const editable = canEdit && binding.editable
  const dirty =
    draft.trim() !== (binding.branchFrom === 'environment' ? (binding.branch ?? '') : '')
  const push = pushDeployLine({
    environment: environmentName,
    branch: binding.branch,
    deployOnPush: binding.deployOnPush,
    autoDeploy: repository?.autoDeploy ?? null,
  })
  const canTurnOn =
    (push.turnOn === 'repository' && canEdit && repository !== undefined) ||
    (push.turnOn === 'environment' && editable)

  return (
    <View style={styles.binding}>
      <Text style={styles.serviceName}>
        {binding.serviceName}
        {repository ? (
          <Text style={panelStyles.muted}>{`  ·  ${repositoryLabel(repository)}`}</Text>
        ) : null}
      </Text>
      <Text style={panelStyles.muted}>{branchSummary(binding)}</Text>
      <View style={styles.pushLine}>
        <Text style={[panelStyles.muted, styles.pushText]}>{push.text}</Text>
        {canTurnOn ? (
          <Button
            label="Turn on"
            size="sm"
            variant="secondary"
            busy={push.turnOn === 'repository' ? turningOn : saving}
            busyLabel="Turning on…"
            accessibilityLabel={
              push.turnOn === 'repository' ? "Turn on the repository's auto-deploy" : undefined
            }
            onPress={() => {
              if (push.turnOn === 'repository' && repository) onTurnOnRepository(repository.id)
              else onPatch({ deployOnPush: true })
            }}
          />
        ) : null}
      </View>
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

/**
 * Which branch of each connected repository this environment builds, and
 * whether a push to it deploys.
 *
 * The branch is the environment's own — saved as a small override in its
 * compose document on top of the project's — so one project can build `main` in
 * production and `staging` in staging. The repository's auto-deploy switch is
 * still the one that arms the webhook for every environment, so each service's
 * push sentence names it and offers Turn on when it is off.
 */
export function EnvironmentGitSourcePanel({
  orgId,
  environmentId,
  environmentName,
  projectCompose,
  environmentCompose,
  canEdit,
}: Readonly<{
  orgId: string
  environmentId: string
  /** Names the environment in the push sentence. */
  environmentName: string
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
    <Section title="Git branch" note="What this environment builds, and whether a push deploys it">
      {updateRepository.actionError ? (
        <Text style={panelStyles.error}>{updateRepository.actionError}</Text>
      ) : null}
      {bindings.map((binding) => (
        <BindingRow
          key={binding.serviceName}
          binding={binding}
          environmentName={environmentName}
          repository={repositories.find((row) => row.id === binding.sourceId)}
          canEdit={canEdit}
          saving={savingService === binding.serviceName}
          turningOn={updateRepository.isPending}
          onTurnOnRepository={(repositoryId) => {
            void updateRepository.run({ repositoryId, patch: { autoDeploy: 'immediate' } })
          }}
          onPatch={(patch) => {
            void save(binding.serviceName, patch)
          }}
        />
      ))}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </Section>
  )
}

const styles = StyleSheet.create({
  binding: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pushLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pushText: {
    flexShrink: 1,
  },
  serviceName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
})
