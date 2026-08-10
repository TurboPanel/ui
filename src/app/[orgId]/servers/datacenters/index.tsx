import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network sites root. */
export default function LegacyServersDatacentersRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()
  return <Redirect href={`/${orgId ?? ''}/network` as Href} />
}
