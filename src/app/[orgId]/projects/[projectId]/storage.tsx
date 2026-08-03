import { ComposeStorageTab } from '@/components/org/project/compose-tabs'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject, projectTabHref } from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

export default function ProjectStorageScreen() {
  const { orgId, projectId, project } = useProjectContext()
  if (project && isManagedProject(project)) {
    return (
      <Redirect href={projectTabHref(orgId, projectId, 'data') as Href} />
    )
  }
  return <ComposeStorageTab />
}
