import { useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { TypeNameConfirmModal } from '@/components/ui'
import { ActionButton, ListGroup, ListRow } from '@/components/ui/v4'
import { confirmationName } from '@/lib/confirm-name'
import { environmentConfirmName } from '@/lib/environment-delete'
import { MANAGED_RUNTIME_PRESENT_ERROR } from '@/lib/instance-api'
import { projectOverviewHref, projectSettingsHref } from '@/lib/project-navigation'
import {
  commandStatusById,
  isTerminalCommandStatus,
  useCommandsBatch,
  useDeleteEnvironment,
  useDeleteEnvironmentManagedMutation,
  type TrackedCommandEntry,
} from '@/lib/queries'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/**
 * Delete, at the end of a managed environment's Settings, where a website
 * project keeps it. With more than one environment it deletes this one: the
 * database is destroyed first (`managed.destroy`), then the environment row
 * goes. With one, deleting means deleting the project, which Project
 * Settings › Danger zone does.
 */
export function ManagedEnvironmentDelete({ environmentId }: Readonly<{ environmentId: string }>) {
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    environments,
    canOwn,
    projectAllowsMutations,
    invalidateEnvironments,
  } = useProjectContext()
  const deleteEnvironment = useDeleteEnvironment(orgId)
  const destroyManaged = useDeleteEnvironmentManagedMutation(orgId)
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [trackedDestroy, setTrackedDestroy] = useState<readonly TrackedCommandEntry[]>([])
  const commandsQuery = useCommandsBatch(orgId, trackedDestroy)
  const commandsById = useMemo(() => commandStatusById(commandsQuery.data), [commandsQuery.data])

  const environment = environments.find((row) => row.id === environmentId)
  const environmentName = environmentConfirmName(environment ?? { id: environmentId })
  // The name typed in the dialog; kept for the row delete that follows the destroy.
  const [typedName, setTypedName] = useState<string | null>(null)

  const removeRow = useCallback(
    async (confirmName: string) => {
      const result = await deleteEnvironment.run({ id: environmentId, confirmName })
      if (!result.ok) {
        const message = result.error ?? ''
        setError(
          message.includes(MANAGED_RUNTIME_PRESENT_ERROR)
            ? 'Destroy the database first — it is still running on the server.'
            : message || null
        )
        return
      }
      setArmed(false)
      await invalidateEnvironments()
      router.replace(projectOverviewHref(orgId, projectId) as Href)
    },
    [deleteEnvironment, environmentId, invalidateEnvironments, router, orgId, projectId]
  )

  useEffect(() => {
    // Join on command id: unreadable ids are dropped from the batched response.
    const commandId = trackedDestroy[0]?.commandId
    const command = commandId ? commandsById.get(commandId) : undefined
    if (!command || !isTerminalCommandStatus(command.status)) return
    setTrackedDestroy([])
    if (command.status !== 'succeeded') {
      setError(command.errorMessage ?? `Destroy ${command.status}`)
      return
    }
    if (typedName !== null) void removeRow(typedName)
  }, [commandsById, trackedDestroy, removeRow, typedName])

  if (!canOwn || !projectAllowsMutations) return null

  if (environments.length <= 1) {
    return (
      <ListGroup>
        <ListRow
          title="Delete this project"
          sub="The only environment goes with its project: delete it from Project Settings."
          danger
          onPress={() => router.push(projectSettingsHref(orgId, projectId) as Href)}
        />
      </ListGroup>
    )
  }

  const destroying = destroyManaged.isPending || trackedDestroy.length > 0
  const working = destroying || deleteEnvironment.isPending

  const confirm = async (typed: string) => {
    setError(null)
    setTypedName(typed)
    // The typed environment name confirms the whole delete; the destroy step
    // is confirmed with the project's name, the name the database goes by.
    const destroy = await destroyManaged.run({
      environmentId,
      confirmName: confirmationName(project?.name, projectId),
    })
    if (!destroy.ok) {
      if (destroy.error) setError(userErrorMessage(destroy.cause ?? new Error(destroy.error), ''))
      return
    }
    if (destroy.value.deleted) {
      await removeRow(typed)
      return
    }
    const { commandId, serverId } = destroy.value
    if (!commandId || !serverId) {
      setError('Destroy queued but target server was not returned')
      return
    }
    setTrackedDestroy([{ serverId, commandId }])
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {error && !armed ? <Text style={panelStyles.error}>{error}</Text> : null}
      <ListGroup>
        <ListRow
          title="Delete this environment"
          sub="Destroys its database and backups, then removes the environment."
          danger
          trailing={
            <ActionButton
              label="Delete"
              variant="danger"
              size="sm"
              disabled={working}
              onPress={() => {
                setError(null)
                setArmed(true)
              }}
            />
          }
        />
      </ListGroup>
      {armed ? (
        <TypeNameConfirmModal
          thing="Environment"
          name={environmentName}
          description="Destroys its database and backups, then removes the environment."
          pending={working}
          error={error}
          onCancel={() => setArmed(false)}
          onConfirm={(typed) => {
            void confirm(typed)
          }}
        />
      ) : null}
    </View>
  )
}
