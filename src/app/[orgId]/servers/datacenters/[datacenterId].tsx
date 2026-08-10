import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network site detail. */
export default function LegacyDatacenterDetailRedirect() {
  const { orgId, datacenterId } = useLocalSearchParams<{
    orgId: string
    datacenterId: string | string[]
  }>()
  const id = Array.isArray(datacenterId)
    ? (datacenterId[0] ?? '')
    : (datacenterId ?? '')
  return (
    <Redirect href={`/${orgId ?? ''}/network/sites/${id}` as Href} />
  )
}
