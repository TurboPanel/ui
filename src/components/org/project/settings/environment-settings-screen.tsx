import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { EnvironmentDeleteControl } from '@/components/org/project-settings-area'
import { useProjectContext } from '@/components/org/project/project-context'
import { EnvironmentGitSourceSection } from '@/components/org/project/overview-environments-panel'
import { EnvironmentSettingsView } from '@/components/org/project/settings/environment-settings-view'
import { LoadingState } from '@/components/ui'
import { projectSettingsHref } from '@/lib/project-navigation'
import { useOrgServers, useUpdateEnvironment } from '@/lib/queries'
import {
  buildEnvironmentRenamePatch,
  buildServerMovePatch,
  environmentRenameProblem,
  environmentServerFacts,
  serverMoveChoices,
  type MoveChoice,
} from '@/lib/v4/environment-settings'

type Busy = 'rename' | 'move' | null

/**
 * The body of Environment Settings for one environment. Both saves go through
 * the one environment record (`PATCH /environments/:id`); a refusal shows on
 * the shell's error line and leaves what was typed in place.
 */
export function EnvironmentSettingsBody({ showGitSource }: Readonly<{ showGitSource: boolean }>) {
  const { orgId, projectId, project, environments, selectedEnvironment, canOwn, canManage, projectAllowsMutations, setError } =
    useProjectContext()
  const router = useRouter()
  const environmentId = selectedEnvironment?.id ?? ''
  const update = useUpdateEnvironment(orgId, environmentId)
  const serversQuery = useOrgServers(orgId)
  const servers = useMemo(() => serversQuery.data?.servers ?? [], [serversQuery.data])
  const [typed, setTyped] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  if (!selectedEnvironment) return <LoadingState />

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
      rename={{
        name,
        onName: setTyped,
        error: typed === null ? null : environmentRenameProblem(name, selectedEnvironment, environments),
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
      server={environmentServerFacts(selectedEnvironment, projectServerId, servers)}
      moveChoices={serverMoveChoices(selectedEnvironment, projectServerId, servers)}
      moving={busy === 'move'}
      onMove={(choice: MoveChoice) => {
        void run('move', buildServerMovePatch(choice))
      }}
      gitSource={showGitSource ? <EnvironmentGitSourceSection /> : null}
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
