import { useLocalSearchParams } from 'expo-router'
import { NetworksOverviewSection } from '@/components/org/networks-overview-section'

export default function ServersNetworksScreen() {
  const { orgId, serverId } = useLocalSearchParams<{
    orgId: string
    serverId?: string | string[]
  }>()

  const resolvedServerId = Array.isArray(serverId)
    ? serverId[0]
    : serverId

  return (
    <NetworksOverviewSection
      orgId={orgId ?? ''}
      serverId={resolvedServerId}
    />
  )
}
