import { useLocalSearchParams } from 'expo-router'
import { NetworkSitesSection } from '@/components/org/network/network-sites-section'

export default function NetworkSitesScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkSitesSection orgId={orgId ?? ''} />
}
