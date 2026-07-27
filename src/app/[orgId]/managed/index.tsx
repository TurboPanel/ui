import { useLocalSearchParams } from 'expo-router'
import { ManagedOverviewSection } from '@/components/org/managed/managed-overview-section'

export default function ManagedOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ManagedOverviewSection orgId={orgId ?? ''} />
}
