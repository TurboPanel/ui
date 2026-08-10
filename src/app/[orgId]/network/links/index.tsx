import { useLocalSearchParams } from 'expo-router'
import { NetworkLinksSection } from '@/components/org/network/network-links-section'

export default function NetworkLinksScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkLinksSection orgId={orgId ?? ''} />
}
