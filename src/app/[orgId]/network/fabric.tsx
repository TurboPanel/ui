import { useLocalSearchParams } from 'expo-router'
import { NetworkFabricSection } from '@/components/org/network/network-fabric-section'

export default function NetworkFabricScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkFabricSection orgId={orgId ?? ''} />
}
