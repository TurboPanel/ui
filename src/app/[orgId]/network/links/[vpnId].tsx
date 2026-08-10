import { useLocalSearchParams } from 'expo-router'
import { NetworkLinkDetailSection } from '@/components/org/network/network-link-detail-section'

export default function NetworkLinkDetailScreen() {
  const { orgId, vpnId } = useLocalSearchParams<{
    orgId: string
    vpnId: string | string[]
  }>()

  const resolvedVpnId = Array.isArray(vpnId) ? (vpnId[0] ?? '') : (vpnId ?? '')

  return (
    <NetworkLinkDetailSection orgId={orgId ?? ''} vpnId={resolvedVpnId} />
  )
}
