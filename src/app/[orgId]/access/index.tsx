import { useLocalSearchParams } from 'expo-router'
import { AccessOverviewSection } from '@/components/org/access-overview-section'

export default function AccessOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <AccessOverviewSection orgId={orgId ?? ''} />
}
