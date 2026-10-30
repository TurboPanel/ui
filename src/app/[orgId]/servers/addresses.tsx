import { useLocalSearchParams } from 'expo-router'
import { NetworkAddressesSection } from '@/components/org/network/network-addresses-section'

export default function ServersAddressesScreen() {
  const { orgId } = useLocalSearchParams<{
    orgId: string
  }>()

  return <NetworkAddressesSection orgId={orgId ?? ''} />
}
