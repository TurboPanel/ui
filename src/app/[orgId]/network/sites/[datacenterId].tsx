import { useLocalSearchParams } from 'expo-router'
import { NetworkSiteDetailSection } from '@/components/org/network/network-site-detail-section'

export default function NetworkSiteDetailScreen() {
  const { orgId, datacenterId } = useLocalSearchParams<{
    orgId: string
    datacenterId: string | string[]
  }>()

  const resolvedDatacenterId = Array.isArray(datacenterId)
    ? (datacenterId[0] ?? '')
    : (datacenterId ?? '')

  return (
    <NetworkSiteDetailSection
      orgId={orgId ?? ''}
      datacenterId={resolvedDatacenterId}
    />
  )
}
