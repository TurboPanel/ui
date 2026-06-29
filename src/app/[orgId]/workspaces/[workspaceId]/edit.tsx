import { useLocalSearchParams } from 'expo-router'
import { WorkspaceFormSection } from '@/components/org/workspace-form-section'

export default function EditWorkspaceScreen() {
  const { orgId, workspaceId } = useLocalSearchParams<{
    orgId: string
    workspaceId: string
  }>()

  return (
    <WorkspaceFormSection
      orgId={orgId ?? ''}
      workspaceId={workspaceId ?? ''}
      mode="edit"
    />
  )
}
