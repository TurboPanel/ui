import { useLocalSearchParams } from 'expo-router'
import { IpsOverviewSection } from '@/components/org/ips-overview-section'

export default function ServersIpsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <IpsOverviewSection orgId={orgId ?? ''} />
}
