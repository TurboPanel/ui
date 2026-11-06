import { useLocalSearchParams } from 'expo-router'
import { NetworkTunnelsSection } from '@/components/org/network/network-tunnels-section'

export default function ServersTunnelsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkTunnelsSection orgId={orgId ?? ''} />
}
