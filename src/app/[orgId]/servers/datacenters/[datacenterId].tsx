import { useLocalSearchParams } from 'expo-router'
import { DatacenterDetailSection } from '@/components/org/datacenter-detail-section'

export default function DatacenterDetailScreen() {
  const { orgId, datacenterId } = useLocalSearchParams<{
    orgId: string
    datacenterId: string | string[]
  }>()

  const resolvedDatacenterId = Array.isArray(datacenterId)
    ? (datacenterId[0] ?? '')
    : (datacenterId ?? '')

  return (
    <DatacenterDetailSection
      orgId={orgId ?? ''}
      datacenterId={resolvedDatacenterId}
    />
  )
}
