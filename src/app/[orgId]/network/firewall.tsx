import { useLocalSearchParams } from 'expo-router'
import { NetworkFirewallSection } from '@/components/org/network/network-firewall-section'

export default function NetworkFirewallScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkFirewallSection orgId={orgId ?? ''} />
}
