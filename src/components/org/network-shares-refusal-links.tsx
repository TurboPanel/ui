import { useRouter, type Href } from 'expo-router'
import { View } from 'react-native'
import { TextLink } from '@/components/ui'
import { serverDetailHref } from '@/lib/org-navigation'

/**
 * After a deploy is refused because a server has Allow Network Shares off: one
 * link per server to its settings. Only people who can manage servers get the
 * links (the switch is theirs); everyone else reads the sentence and asks an admin.
 */
export function NetworkSharesRefusalLinks({
  orgId,
  servers,
  canManage,
}: Readonly<{
  orgId: string
  servers: readonly { id: string; name: string }[]
  canManage: boolean
}>) {
  const router = useRouter()
  if (!canManage || servers.length === 0) return null
  return (
    <View>
      {servers.map((server) => (
        <TextLink
          key={server.id}
          label={`Open settings for ${server.name}`}
          size="sm"
          onPress={() => router.push(serverDetailHref(orgId, server.id) as Href)}
        />
      ))}
    </View>
  )
}
