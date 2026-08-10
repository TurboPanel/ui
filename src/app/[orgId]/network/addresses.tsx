import { useLocalSearchParams } from 'expo-router'
import { NetworkAddressesSection } from '@/components/org/network/network-addresses-section'

export default function NetworkAddressesScreen() {
  const { orgId, serverId } = useLocalSearchParams<{
    orgId: string
    serverId?: string | string[]
  }>()

  const resolvedServerId = Array.isArray(serverId) ? serverId[0] : serverId

  return (
    <NetworkAddressesSection
      orgId={orgId ?? ''}
      serverId={resolvedServerId}
    />
  )
}
