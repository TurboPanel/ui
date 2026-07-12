import { useLocalSearchParams } from 'expo-router'
import { ServerMetricsSection } from '@/components/org/server-metrics-section'

export default function ServerMetricsScreen() {
  const { orgId, serverId } = useLocalSearchParams<{
    orgId: string
    serverId: string | string[]
  }>()

  const resolvedServerId = Array.isArray(serverId)
    ? (serverId[0] ?? '')
    : (serverId ?? '')

  return (
    <ServerMetricsSection
      orgId={orgId ?? ''}
      serverId={resolvedServerId}
    />
  )
}
