import { ManagedFocusTab } from '@/components/org/project/managed-focus-tab'
import { useProjectContext } from '@/components/org/project/project-context'
import { isManagedProject, projectTabHref } from '@/lib/project-navigation'
import { Redirect, type Href } from 'expo-router'

export default function ProjectBackupsScreen() {
  const { orgId, projectId, project } = useProjectContext()
  if (!project || !isManagedProject(project)) {
    return (
      <Redirect
        href={projectTabHref(orgId, projectId, 'overview') as Href}
      />
    )
  }
  return <ManagedFocusTab focus="backups" />
}
