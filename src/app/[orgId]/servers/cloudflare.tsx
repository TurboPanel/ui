import { useLocalSearchParams } from 'expo-router'
import { NetworkCloudflareSection } from '@/components/org/network/network-cloudflare-section'

export default function ServersCloudflareScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkCloudflareSection orgId={orgId ?? ''} />
}
