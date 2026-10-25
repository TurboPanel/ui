import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { Text } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  projectEnvironmentHref,
  projectOverviewHref,
  projectSetupHref,
} from '@/lib/project-navigation'
import { primaryEnvironmentOf } from '@/lib/v4/primary-environment'

export default function ProjectIndexScreen() {
  const { orgId, projectId } = useLocalSearchParams<{
    orgId: string
    projectId: string
  }>()
  const { loading, needsSetup, project, environments, isSystemProject } = useProjectContext()

  if (loading) {
    return <Text style={panelStyles.muted}>Loading…</Text>
  }

  if (needsSetup) {
    return <Redirect href={projectSetupHref(orgId ?? '', projectId ?? '') as Href} />
  }

  // A project, a managed database too, opens on its primary environment.
  const primary = project && !isSystemProject ? primaryEnvironmentOf(environments) : null
  if (primary) {
    return (
      <Redirect href={projectEnvironmentHref(orgId ?? '', projectId ?? '', primary.id) as Href} />
    )
  }

  return <Redirect href={projectOverviewHref(orgId ?? '', projectId ?? '') as Href} />
}
