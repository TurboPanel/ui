import { Slot, useLocalSearchParams, Redirect, type Href } from 'expo-router'
import { ProjectProvider } from '@/components/org/project/project-context'
import { ProjectShell } from '@/components/org/project/project-shell'
import { organizationsHref } from '@/lib/org-navigation'

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default function ProjectLayout() {
  const { orgId, projectId } = useLocalSearchParams<{
    orgId: string
    projectId: string | string[]
  }>()
  const resolvedOrgId = firstParam(orgId)
  const resolvedProjectId = firstParam(projectId)

  if (!resolvedOrgId || !resolvedProjectId) {
    return <Redirect href={organizationsHref() as Href} />
  }

  return (
    <ProjectProvider orgId={resolvedOrgId} projectId={resolvedProjectId}>
      <ProjectShell>
        <Slot />
      </ProjectShell>
    </ProjectProvider>
  )
}
