import { useLocalSearchParams } from 'expo-router'
import { ServerDetailSection } from '@/components/org/server-detail-section'

export default function ServerDetailScreen() {
  const { orgId, serverId } = useLocalSearchParams<{
    orgId: string
    serverId: string | string[]
  }>()

  const resolvedServerId = Array.isArray(serverId)
    ? (serverId[0] ?? '')
    : (serverId ?? '')

  return (
    <ServerDetailSection
      orgId={orgId ?? ''}
      serverId={resolvedServerId}
    />
  )
}
