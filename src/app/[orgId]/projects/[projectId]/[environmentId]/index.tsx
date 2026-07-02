import { useLocalSearchParams } from 'expo-router'
import { EnvironmentDetailSection } from '@/components/org/environment-detail-section'

export default function EnvironmentDetailScreen() {
  const { orgId, projectId, environmentId } = useLocalSearchParams<{
    orgId: string
    projectId: string
    environmentId: string
  }>()

  return (
    <EnvironmentDetailSection
      orgId={orgId ?? ''}
      projectId={projectId ?? ''}
      environmentId={environmentId ?? ''}
    />
  )
}
