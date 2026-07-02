import { useLocalSearchParams } from 'expo-router'
import { ProjectDetailSection } from '@/components/org/project-detail-section'

export default function ProjectDetailScreen() {
  const { orgId, projectId } = useLocalSearchParams<{
    orgId: string
    projectId: string
  }>()

  return (
    <ProjectDetailSection
      orgId={orgId ?? ''}
      projectId={projectId ?? ''}
    />
  )
}
