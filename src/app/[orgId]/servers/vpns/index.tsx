import { useLocalSearchParams } from 'expo-router'
import { VpnsOverviewSection } from '@/components/org/vpns-overview-section'

export default function ServersVpnsScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <VpnsOverviewSection orgId={orgId ?? ''} />
}
