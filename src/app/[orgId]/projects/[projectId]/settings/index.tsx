import { useProjectContext } from '@/components/org/project/project-context'
import { projectTabHref } from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

/** Settings hub removed — redirect deep links to Overview. */
export default function ProjectSettingsScreen() {
  const { orgId, projectId } = useProjectContext()
  return (
    <Redirect href={projectTabHref(orgId, projectId, 'overview') as Href} />
  )
}
