import { useLocalSearchParams } from 'expo-router'
import { NetworkOverviewSection } from '@/components/org/network/network-overview-section'

export default function NetworkOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkOverviewSection orgId={orgId ?? ''} />
}
