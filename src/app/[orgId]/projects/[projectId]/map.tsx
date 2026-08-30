import { Redirect, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectOverviewHref } from '@/lib/project-navigation'

/**
 * Retired route — the topology Overview lens lives at
 * `/projects/:projectId/overview` now.
 */
export default function ProjectMapScreen() {
  const { orgId, projectId } = useProjectContext()
  return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
}
