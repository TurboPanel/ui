import { useProjectContext } from '@/components/org/project/project-context'
import { projectOverviewHref } from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

/**
 * The bare `/environments` path. Every project, a managed database too, lists
 * its environments on the Environments tab (`/overview`), so this goes there.
 */
export default function ProjectEnvironmentsScreen() {
  const { orgId, projectId } = useProjectContext()
  return <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
}
