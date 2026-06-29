import { useLocalSearchParams } from 'expo-router'
import { WorkspaceFormSection } from '@/components/org/workspace-form-section'

export default function NewWorkspaceScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <WorkspaceFormSection orgId={orgId ?? ''} mode="create" />
}
