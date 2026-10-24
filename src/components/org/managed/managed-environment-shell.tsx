import { useRouter, type Href } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text } from 'react-native'
import {
  ManagedCommandsProvider,
  useManagedEnvironment,
} from '@/components/org/managed/managed-environment-context'
import {
  EnvironmentBadge,
  EnvironmentHeaderFrame,
  EnvironmentTitle,
} from '@/components/org/project/environment-header-parts'
import { useProjectContext } from '@/components/org/project/project-context'
import { ActionButton } from '@/components/ui/v4'
import { managedEnvironmentFacts, managedRunningFact } from '@/lib/managed-environment-facts'
import { environmentPageTabHref } from '@/lib/project-navigation'
import {
  useApplyEnvironmentManaged,
  useManagedStatus,
  useRunManagedLifecycle,
} from '@/lib/queries/managed'
import { useCan } from '@/lib/query-client'
import { colors } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

/** The provider for the environment in the path, mounted by the environment shell. */
export function ManagedEnvironmentProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { orgId, pathEnvironmentId, selectedEnvironment } = useProjectContext()
  const environmentId = pathEnvironmentId ?? selectedEnvironment?.id ?? ''
  return (
    <ManagedCommandsProvider key={environmentId} orgId={orgId} environmentId={environmentId}>
      {children}
    </ManagedCommandsProvider>
  )
}

type HeaderAction = 'apply' | 'start' | 'restart'

/**
 * The environment header of a managed database, laid out like a website's:
 * the name picker and badge, then Connect where Visit sits and Apply changes
 * where Deploy sits, with Restart (or Start when stopped) beside them. Stop,
 * destroy and delete live in Settings › Danger zone.
 */
export function ManagedEnvironmentHeader() {
  const router = useRouter()
  const { orgId, projectId, selectedEnvironment } = useProjectContext()
  const { environmentId, detail, provisioned, registerCommand, inFlight } = useManagedEnvironment()
  const canManage = useCan('organization', orgId, 'organization:manage')
  const statusQuery = useManagedStatus(orgId, environmentId, { enabled: provisioned })
  const apply = useApplyEnvironmentManaged(orgId, environmentId)
  const lifecycle = useRunManagedLifecycle(orgId, environmentId)
  const [working, setWorking] = useState<HeaderAction | null>(null)
  const [error, setError] = useState<string | null>(null)

  const status = statusQuery.data?.status ?? detail?.managed?.status ?? null
  const facts = useMemo(() => managedEnvironmentFacts(detail, status), [detail, status])
  if (!selectedEnvironment) return null

  const running = managedRunningFact(provisioned ? status : null)
  const busy = inFlight || working !== null || status === 'applying' || status === 'provisioning'
  const blocked = !provisioned || !canManage || busy
  const restartAction: HeaderAction = status === 'stopped' ? 'start' : 'restart'

  const run = async (action: HeaderAction) => {
    setWorking(action)
    setError(null)
    try {
      if (action === 'apply') {
        const result = await apply.mutateAsync()
        registerCommand(result.commandId, 'Apply')
      } else {
        const result = await lifecycle.mutateAsync(action)
        registerCommand(result.commandId, action)
      }
    } catch (err) {
      setError(userErrorMessage(err, 'Action failed'))
    } finally {
      setWorking(null)
    }
  }

  return (
    <>
      <EnvironmentHeaderFrame
        title={
          <>
            <EnvironmentTitle statusLabel={running.value} />
            <EnvironmentBadge environment={selectedEnvironment} />
          </>
        }
        actions={
          <>
            <ActionButton
              label="Connect"
              disabled={!provisioned}
              accessibilityLabel="Connect to this database"
              onPress={() =>
                router.push(
                  environmentPageTabHref(orgId, projectId, environmentId, 'bindings') as Href
                )
              }
            />
            <ActionButton
              label={restartAction === 'start' ? 'Start' : 'Restart'}
              busy={working === restartAction}
              disabled={blocked}
              onPress={() => {
                void run(restartAction)
              }}
            />
            <ActionButton
              label="Apply changes"
              busyLabel="Applying…"
              variant="primary"
              busy={working === 'apply'}
              disabled={blocked}
              onPress={() => {
                void run('apply')
              }}
            />
          </>
        }
        facts={facts}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  )
}

const styles = StyleSheet.create({
  error: {
    color: colors.error,
    fontSize: 13,
  },
})
