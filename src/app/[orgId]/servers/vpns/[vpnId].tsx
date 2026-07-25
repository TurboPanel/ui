import { useLocalSearchParams } from 'expo-router'
import { VpnDetailSection } from '@/components/org/vpn-detail-section'

export default function VpnDetailScreen() {
  const { orgId, vpnId } = useLocalSearchParams<{
    orgId: string
    vpnId: string | string[]
  }>()

  const resolvedVpnId = Array.isArray(vpnId) ? (vpnId[0] ?? '') : (vpnId ?? '')

  return <VpnDetailSection orgId={orgId ?? ''} vpnId={resolvedVpnId} />
}
