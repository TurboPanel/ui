import { useMemo } from 'react'
import { useEnvironmentConfigView } from '@/components/org/project/environment-overview/use-config-view'
import { useProjectContext } from '@/components/org/project/project-context'
import { environmentStatusTone } from '@/lib/container-status'
import type { DeploymentHistoryRecord } from '@/lib/instance-api'
import { useContainers } from '@/lib/queries/containers'
import { useEnvironmentBindings } from '@/lib/queries/bindings'
import { useEnvironmentDeployments } from '@/lib/queries/execution-logs'
import { useProjectPrincipals } from '@/lib/queries/projects'
import { useHostingsByServices, useServices } from '@/lib/queries/services'
import { useStorage } from '@/lib/queries/storage'
import { useTlsLibrary } from '@/lib/queries/tls'
import { environmentDisplayName } from '@/lib/resource-labels'
import type { OverviewSource } from '@/lib/v4/environment-overview'

const NONE: never[] = []

export type OverviewModel =
  | Readonly<{ state: 'loading' }>
  | Readonly<{ state: 'unavailable' }>
  | Readonly<{
      state: 'ready'
      source: OverviewSource
      deployments: readonly DeploymentHistoryRecord[]
      running: boolean
    }>

/**
 * The calls behind the Overview: the config view plus services, containers,
 * domains, certificates, storage, bindings, Linux users and deploy history.
 * `unavailable` means the config view could not be read (no manage access, or
 * a saved compose that does not parse), or the service list failed; the screen
 * then keeps the old page rather than drawing a map with no services.
 * The other calls may fail on their own: what they would have said is simply
 * left out.
 */
export function useEnvironmentOverviewModel(): OverviewModel {
  const { orgId, projectId, selectedEnvironment } = useProjectContext()
  const environmentId = selectedEnvironment?.id ?? ''
  const view = useEnvironmentConfigView(orgId, environmentId)
  const services = useServices(orgId, environmentId, { enabled: environmentId !== '' })
  const containers = useContainers(orgId, { environmentId }, { enabled: environmentId !== '' })
  const serviceRows = services.data?.services ?? NONE
  const serviceIds = useMemo(() => serviceRows.map((service) => service.id), [serviceRows])
  const hostings = useHostingsByServices(orgId, serviceIds, { enabled: serviceIds.length > 0 })
  const tls = useTlsLibrary(orgId)
  const storage = useStorage(orgId, { environmentId }, { enabled: environmentId !== '' })
  const bindings = useEnvironmentBindings(orgId, environmentId)
  const principals = useProjectPrincipals(orgId, projectId)
  const history = useEnvironmentDeployments(orgId, environmentId, { enabled: environmentId !== '' })

  const envName = environmentDisplayName(selectedEnvironment ?? {})
  const loaded = view.data !== undefined && services.isSuccess && !hostings.isLoading
  const source = useMemo<OverviewSource | null>(() => {
    if (!view.data) return null
    return {
      envName,
      view: view.data,
      services: serviceRows,
      containers: containers.data?.containers,
      hostings: hostings.hostingsByService,
      tls: tls.data?.tls,
      storage: storage.data?.storage ?? NONE,
      bindings: bindings.data?.bindings ?? NONE,
      principals: principals.data?.principals ?? NONE,
    }
  }, [
    view.data,
    envName,
    serviceRows,
    containers.data,
    hostings.hostingsByService,
    tls.data,
    storage.data,
    bindings.data,
    principals.data,
  ])

  if (view.isError || services.isError) return { state: 'unavailable' }
  if (!loaded || source === null) return { state: 'loading' }
  return {
    state: 'ready',
    source,
    deployments: history.data?.deployments ?? NONE,
    running: environmentStatusTone(containers.data?.containers ?? []).label === 'Running',
  }
}
