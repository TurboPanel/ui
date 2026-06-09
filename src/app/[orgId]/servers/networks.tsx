import { useLocalSearchParams } from 'expo-router'
import { NetworksOverviewSection } from '@/components/org/networks-overview-section'

export default function ServersNetworksScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <NetworksOverviewSection orgId={orgId ?? ''} />
}
