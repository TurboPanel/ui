import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

export default function ServersOverviewLegacyRedirect() {
  const { orgId } = useLocalSearchParams<{ orgId: string }>()

  return <Redirect href={`/${orgId ?? ''}/servers` as Href} />
}
