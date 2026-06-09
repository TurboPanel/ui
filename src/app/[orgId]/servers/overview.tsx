import { useLocalSearchParams } from 'expo-router'
import { ServersOverviewSection } from '@/components/org/servers-overview-section'

export default function ServersOverviewScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <ServersOverviewSection orgId={orgId ?? ''} />
}
