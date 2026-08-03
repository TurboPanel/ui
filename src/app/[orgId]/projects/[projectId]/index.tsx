import { Redirect, useLocalSearchParams, type Href } from 'expo-router'
import { Text } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  projectOverviewHref,
  projectSetupHref,
} from '@/lib/project-navigation'

export default function ProjectIndexScreen() {
  const { orgId, projectId } = useLocalSearchParams<{
    orgId: string
    projectId: string
  }>()
  const { loading, needsSetup } = useProjectContext()

  if (loading) {
    return <Text style={orgPanelStyles.muted}>Loading…</Text>
  }

  if (needsSetup) {
    return (
      <Redirect
        href={projectSetupHref(orgId ?? '', projectId ?? '') as Href}
      />
    )
  }

  return (
    <Redirect
      href={projectOverviewHref(orgId ?? '', projectId ?? '') as Href}
    />
  )
}
