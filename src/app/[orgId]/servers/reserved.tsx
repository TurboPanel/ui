import { useLocalSearchParams } from 'expo-router'
import { NetworkReservedSection } from '@/components/org/network/network-reserved-section'

export default function ServersReservedScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkReservedSection orgId={orgId ?? ''} />
}
