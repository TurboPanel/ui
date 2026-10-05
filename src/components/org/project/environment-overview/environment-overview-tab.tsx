import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { EnvironmentOverviewBody } from '@/components/org/project/environment-overview/environment-overview-body'
import { useEnvironmentOverviewModel } from '@/components/org/project/environment-overview/use-environment-overview'
import { ProjectOverviewTab } from '@/components/org/project/project-overview-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { usePalette } from '@/components/ui/v4/use-palette'

/** A clock for "2h ago" that moves on without a refetch. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/**
 * Environment Overview: the map, the services, the changes from the Base and
 * the latest deployments. When the config view cannot be read (no manage
 * access, or a saved compose that does not parse) the screen that was here
 * before stays, so nothing is hidden behind a blank page.
 */
export function EnvironmentOverviewTab() {
  const { orgId, projectId, environments, selectedEnvironment } = useProjectContext()
  const model = useEnvironmentOverviewModel()
  const now = useNow(60_000)
  const p = usePalette()
  const environmentId = selectedEnvironment?.id ?? ''
  const ids = useMemo(() => ({ orgId, projectId, environmentId }), [orgId, projectId, environmentId])
  if (model.state === 'unavailable') return <ProjectOverviewTab />
  if (model.state === 'loading') {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 48 }}>
        <ActivityIndicator accessibilityLabel="Loading the environment" color={p.text3} />
      </View>
    )
  }
  return (
    <EnvironmentOverviewBody
      ids={ids}
      source={model.source}
      deployments={model.deployments}
      running={model.running}
      environmentCount={environments.length}
      now={now}
    />
  )
}
