import { Redirect, useLocalSearchParams, type Href } from 'expo-router'

/** Legacy → Network sites root. Forwards ?serverId= to addresses pool filter. */
export default function LegacyServersNetworksRedirect() {
  const { orgId, serverId } = useLocalSearchParams<{
    orgId: string
    serverId?: string | string[]
  }>()
  const id = orgId ?? ''
  const resolved = Array.isArray(serverId) ? serverId[0] : serverId
  if (resolved?.trim()) {
    return (
      <Redirect
        href={
          `/${id}/network/addresses?serverId=${encodeURIComponent(resolved.trim())}` as Href
        }
      />
    )
  }
  return <Redirect href={`/${id}/network` as Href} />
}
