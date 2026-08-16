import { useLocalSearchParams } from 'expo-router'
import { DatacentersOverviewSection } from '@/components/org/datacenters-overview-section'

export default function ServersDatacentersScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <DatacentersOverviewSection orgId={orgId ?? ''} />
}
