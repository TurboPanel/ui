import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network addresses. */
export default function LegacyServersIpsRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={`/${orgId ?? ''}/network/addresses` as Href} />
}
