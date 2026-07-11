import { useLocalSearchParams } from 'expo-router'
import { WorkspaceDetailSection } from '@/components/org/workspace-detail-section'

export default function WorkspaceDetailScreen() {
  const { orgId, workspaceId } = useLocalSearchParams<{
    orgId: string
    workspaceId: string
  }>()

  return (
    <WorkspaceDetailSection
      orgId={orgId ?? ''}
      workspaceId={workspaceId ?? ''}
    />
  )
}
