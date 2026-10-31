import { useLocalSearchParams } from 'expo-router'
import { NetworkFirewallSection } from '@/components/org/network/network-firewall-section'

export default function ServersFirewallScreen() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <NetworkFirewallSection orgId={orgId ?? ''} />
}
