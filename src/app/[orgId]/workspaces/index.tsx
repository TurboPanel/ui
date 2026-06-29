import { useLocalSearchParams } from 'expo-router'
import { WorkspacesOverviewSection } from '@/components/org/workspaces-overview-section'

export default function WorkspacesOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <WorkspacesOverviewSection orgId={orgId ?? ''} />
}
