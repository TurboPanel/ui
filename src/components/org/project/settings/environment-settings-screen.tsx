import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { EnvironmentDeleteControl } from '@/components/org/project-settings-area'
import { useProjectContext } from '@/components/org/project/project-context'
import { EnvironmentGitSourceSection } from '@/components/org/project/overview-environments-panel'
import { EnvironmentSettingsView } from '@/components/org/project/settings/environment-settings-view'
import { LoadingState } from '@/components/ui'
import { projectSettingsHref } from '@/lib/project-navigation'
import { userErrorMessage } from '@/lib/user-error'
import { useMakeEnvironmentPrimary, useOrgServers, useUpdateEnvironment } from '@/lib/queries'
import { PRIMARY_DELETE_EXPLANATION } from '@/lib/v4/primary-environment'
import {
  buildEnvironmentRenamePatch,
  buildServerMovePatch,
  environmentRenameProblem,
  environmentServerFacts,
  serverListState,
  serverMoveChoices,
  type MoveChoice,
} from '@/lib/v4/environment-settings'

type Busy = 'rename' | 'move' | 'placement' | null

/**
 * The body of Environment Settings for one environment. The screen stays
 * mounted while the person switches environments, so the form is keyed by the
 * environment: a name typed for one never carries over to the next.
 */
export function EnvironmentSettingsBody({ showGitSource }: Readonly<{ showGitSource: boolean }>) {
  const { selectedEnvironment } = useProjectContext()
  if (!selectedEnvironment) return <LoadingState />
  return (
    <EnvironmentSettingsForm
      key={selectedEnvironment.id}
      selectedEnvironment={selectedEnvironment}
      showGitSource={showGitSource}
    />
  )
}

/**
 * Both saves go through the one environment record (`PATCH /environments/:id`);
 * a refusal shows on the shell's error line and leaves what was typed in place.
 */
function EnvironmentSettingsForm({
  selectedEnvironment,
  showGitSource,
}: Readonly<{ selectedEnvironment: EnvironmentRecord; showGitSource: boolean }>) {
  const {
    orgId,
    projectId,
    project,
    environments,
    canOwn,
    canManage,
    projectAllowsMutations,
    setError,
  } = useProjectContext()
  const router = useRouter()
  const update = useUpdateEnvironment(orgId, selectedEnvironment.id)
  const makePrimary = useMakeEnvironmentPrimary(orgId)
  const serversQuery = useOrgServers(orgId)
  const serverList = serverListState(serversQuery.data, serversQuery.isError)
  const [typed, setTyped] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)

  const canEdit = canManage && projectAllowsMutations
  const projectServerId = project?.options?.defaultServerId ?? null
  const name = typed ?? selectedEnvironment.name ?? ''
  const patch = buildEnvironmentRenamePatch(name, selectedEnvironment, environments)

  const run = async (kind: NonNullable<Busy>, body: Parameters<typeof update.run>[0]) => {
    setError(null)
    setBusy(kind)
    const result = await update.run(body)
    setBusy(null)
    if (!result.ok && update.actionError) setError(update.actionError)
    return result.ok
  }

  return (
    <EnvironmentSettingsView
      environmentName={selectedEnvironment.name?.trim() || 'this environment'}
      canEdit={canEdit}
      placement={{
        isPrimary: selectedEnvironment.isPrimary === true,
        pinned: selectedEnvironment.pinned === true,
        alone: environments.length <= 1,
        busy: busy === 'placement' || makePrimary.isPending,
        onMakePrimary: async () => {
          const result = await makePrimary.run(selectedEnvironment.id)
          if (result.ok) return null
          return userErrorMessage(result.cause, 'Could not make this the primary environment.')
        },
        onTogglePin: () => {
          void run('placement', { pinned: selectedEnvironment.pinned !== true })
        },
      }}
      rename={{
        name,
        onName: setTyped,
        error:
          typed === null ? null : environmentRenameProblem(name, selectedEnvironment, environments),
        dirty: name.trim() !== (selectedEnvironment.name ?? '').trim(),
        canSave: patch !== null,
        saving: busy === 'rename',
        onSave: () => {
          if (!patch) return
          void run('rename', patch).then((ok) => {
            if (ok) setTyped(null)
          })
        },
        onReset: () => setTyped(null),
      }}
      server={environmentServerFacts(selectedEnvironment, projectServerId, serverList)}
      moveChoices={serverMoveChoices(selectedEnvironment, projectServerId, serverList)}
      moving={busy === 'move'}
      onMove={(choice: MoveChoice) => {
        void run('move', buildServerMovePatch(choice))
      }}
      gitSource={showGitSource ? <EnvironmentGitSourceSection /> : null}
      deleteNote={
        selectedEnvironment.isPrimary === true && environments.length > 1
          ? PRIMARY_DELETE_EXPLANATION
          : null
      }
      danger={
        canOwn && projectAllowsMutations ? (
          <EnvironmentDeleteControl
            selectedEnvironment={selectedEnvironment}
            onOpenProjectSettings={() => router.push(projectSettingsHref(orgId, projectId) as Href)}
          />
        ) : null
      }
    />
  )
}
