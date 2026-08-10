import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network link detail. */
export default function LegacyVpnDetailRedirect() {
  const { orgId, vpnId } = useLocalSearchParams<{
    orgId: string
    vpnId: string | string[]
  }>()
  const id = Array.isArray(vpnId) ? (vpnId[0] ?? '') : (vpnId ?? '')
  return (
    <Redirect href={`/${orgId ?? ''}/network/links/${id}` as Href} />
  )
}
