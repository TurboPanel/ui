import { Redirect, type Href } from 'expo-router'
import { useProjectContext } from '@/components/org/project/project-context'
import { projectOverviewHref } from '@/lib/project-navigation'

/** Services list lives on Overview; keep this route as a redirect. */
export default function ProjectServicesScreen() {
  const { orgId, projectId } = useProjectContext()
  return (
    <Redirect href={projectOverviewHref(orgId, projectId) as Href} />
  )
}
