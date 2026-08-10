import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network links. */
export default function LegacyServersVpnsRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={`/${orgId ?? ''}/network/links` as Href} />
}
