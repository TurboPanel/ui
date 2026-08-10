import { useLocalSearchParams } from 'expo-router'
import { NetworkAddressesSection } from '@/components/org/network/network-addresses-section'

export default function NetworkAddressesScreen() {
  const { orgId } = useLocalSearchParams<{
    orgId: string
  }>()

  return <NetworkAddressesSection orgId={orgId ?? ''} />
}
