import { useLocalSearchParams } from 'expo-router'
import { ProjectsOverviewSection } from '@/components/org/projects-overview-section'

export default function ProjectsOverviewScreen() {
  const { orgId, workspaceId } = useLocalSearchParams<{
    orgId: string
    workspaceId?: string
  }>()

  return (
    <ProjectsOverviewSection
      orgId={orgId ?? ''}
      workspaceId={typeof workspaceId === 'string' ? workspaceId : undefined}
    />
  )
}
