import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'
import {
  EnvironmentSetupForm,
  type EnvironmentSetupIntent,
  type EnvironmentSetupResult,
} from '@/components/org/project-create/environment-setup-form'
import { useProjectContext } from '@/components/org/project/project-context'
import { PreviewDeploymentModal } from '@/components/org/project/preview-deployment-modal'
import { LoadingState } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { deployRefusalMessage } from '@/lib/deploy-error-message'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { setupEnvironmentPatch, setupVariableBodies } from '@/lib/project-create/environment-setup'
import { projectEnvironmentHref } from '@/lib/project-navigation'
import {
  useCreateVariable,
  useDeployEnvironment,
  useEnvironment,
  useOrgServers,
  useUpdateEnvironment,
} from '@/lib/queries'
import { serverDisplayName } from '@/lib/resource-labels'
import { failedRunMessage, userErrorMessage } from '@/lib/user-error'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'

/**
 * Route body for `/[projectId]/setup/environment`: loads the project's first
 * environment and the servers, then hands them to the form. Save writes the
 * environment once (name, server, compose with the hostname) and then each
 * variable; Deploy does the same and opens the plain deploy confirm.
 */
export function ProjectEnvironmentSetupSection() {
  const { orgId, project, environments, loading, canManage } = useProjectContext()
  const environment = primaryEnvironmentOf(environments)
  if (!project || !environment) {
    if (loading) return <LoadingState label="Loading project…" />
    return <Text style={panelStyles.muted}>This project has no environment to set up.</Text>
  }
  return (
    <EnvironmentSetupLoader
      orgId={orgId}
      projectId={project.id}
      projectName={project.name ?? 'This project'}
      projectCompose={project.options?.compose ?? null}
      projectDefaultServerId={project.options?.defaultServerId ?? null}
      environmentId={environment.id}
      canManage={canManage}
    />
  )
}

function EnvironmentSetupLoader({
  orgId,
  projectId,
  projectName,
  projectCompose,
  projectDefaultServerId,
  environmentId,
  canManage,
}: Readonly<{
  orgId: string
  projectId: string
  projectName: string
  projectCompose: unknown
  projectDefaultServerId: string | null
  environmentId: string
  canManage: boolean
}>) {
  // The environment is read on its own so the form starts from the saved compose.
  const environmentQuery = useEnvironment(orgId, environmentId)
  const serversQuery = useOrgServers(orgId)
  const environment = environmentQuery.data?.environment
  if (!environment || !serversQuery.data) {
    const failed = environmentQuery.error ?? serversQuery.error
    if (failed) {
      return (
        <Text style={panelStyles.error}>
          {userErrorMessage(failed, 'Could not load this environment.')}
        </Text>
      )
    }
    return <LoadingState label="Loading environment…" />
  }
  return (
    <EnvironmentSetupScreen
      orgId={orgId}
      projectId={projectId}
      projectName={projectName}
      projectCompose={projectCompose}
      projectDefaultServerId={projectDefaultServerId}
      environment={environment}
      servers={serversQuery.data.servers}
      canManage={canManage}
    />
  )
}

function EnvironmentSetupScreen({
  orgId,
  projectId,
  projectName,
  projectCompose,
  projectDefaultServerId,
  environment,
  servers,
  canManage,
}: Readonly<{
  orgId: string
  projectId: string
  projectName: string
  projectCompose: unknown
  projectDefaultServerId: string | null
  environment: EnvironmentRecord
  servers: Parameters<typeof EnvironmentSetupForm>[0]['servers']
  canManage: boolean
}>) {
  const router = useRouter()
  const { customDefaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)
  const updateEnvironment = useUpdateEnvironment(orgId, environment.id)
  const createVariable = useCreateVariable(orgId, { environmentId: environment.id })
  const deploy = useDeployEnvironment(orgId, environment.id)
  const [busy, setBusy] = useState<EnvironmentSetupIntent | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Set once Deploy saved everything: what the confirm shows. */
  const [confirm, setConfirm] = useState<EnvironmentSetupResult | null>(null)
  /** Variables already created by an earlier press, so a retry does not add them twice. */
  const [savedKeys, setSavedKeys] = useState<readonly string[]>([])

  const environmentHref = projectEnvironmentHref(orgId, projectId, environment.id)
  const savedCompose = environment.options?.compose ?? null

  const save = async (result: EnvironmentSetupResult): Promise<boolean> => {
    const patch = setupEnvironmentPatch({
      savedName: environment.name ?? '',
      name: result.name,
      savedServerId: environment.serverId,
      serverId: result.serverId,
      savedCompose,
      compose: result.compose,
      primaryHostname: environment.options?.primaryHostname ?? null,
    })
    if (patch) {
      const saved = await updateEnvironment.run(patch)
      if (!saved.ok) {
        setError(failedRunMessage(saved, 'Could not save this environment.'))
        return false
      }
    }
    const created = [...savedKeys]
    for (const body of setupVariableBodies(result.variables)) {
      if (created.includes(body.key)) continue
      const saved = await createVariable.run(body)
      if (!saved.ok) {
        setSavedKeys(created)
        setError(failedRunMessage(saved, `Could not save the variable ${body.key}.`))
        return false
      }
      created.push(body.key)
    }
    setSavedKeys(created)
    return true
  }

  const submit = async (result: EnvironmentSetupResult, intent: EnvironmentSetupIntent) => {
    setError(null)
    setBusy(intent)
    const ok = await save(result)
    setBusy(null)
    if (!ok) return
    if (intent === 'save') {
      router.replace(environmentHref as Href)
      return
    }
    setConfirm(result)
  }

  const runDeploy = async () => {
    const started = await deploy.run(undefined)
    if (!started.ok) {
      setConfirm(null)
      setError(
        started.cause
          ? deployRefusalMessage(started.cause)
          : (started.error ?? 'Could not start the deploy.')
      )
      return
    }
    // The environment's Overview shows the deploy as it runs.
    router.replace(environmentHref as Href)
  }

  const confirmServer = servers.find((server) => server.id === confirm?.serverId)
  return (
    <>
      <EnvironmentSetupForm
        orgId={orgId}
        projectName={projectName}
        environmentName={environment.name ?? ''}
        environmentServerId={environment.serverId}
        projectDefaultServerId={projectDefaultServerId}
        compose={savedCompose}
        servers={servers}
        defaultEnvironmentName={customDefaultEnvironmentName}
        busy={busy}
        error={error}
        onSubmit={(result, intent) => {
          void submit(result, intent)
        }}
      />
      <PreviewDeploymentModal
        visible={confirm !== null}
        orgId={orgId}
        environmentId={environment.id}
        environmentLabel={confirm?.name || environment.name || undefined}
        canManage={canManage}
        placementServerId={confirm?.serverId ?? null}
        placementServerLabel={confirmServer ? serverDisplayName(confirmServer) : null}
        projectCompose={projectCompose}
        environmentCompose={confirm?.compose ?? savedCompose}
        deploying={deploy.isPending}
        onCancel={() => {
          setConfirm(null)
        }}
        onConfirm={() => {
          void runDeploy()
        }}
      />
    </>
  )
}
