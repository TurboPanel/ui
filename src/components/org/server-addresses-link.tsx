import { Link, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { serverDetailTabHref } from '@/lib/org-navigation'
import { useServerAddresses } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import { colors, webPointer } from '@/lib/theme'

/**
 * Opens the server's Network tab, where the "Addresses clients use" card sits
 * on top. Renders nothing whenever that card would be hidden (older control
 * plane, or a viewer who cannot manage), so it never leads to an empty tab.
 * Shares the card's query, so it costs no extra read.
 */
export function ServerAddressesLink({
  orgId,
  serverId,
  label,
}: Readonly<{ orgId: string; serverId: string; label: string }>) {
  const canManage = useCan('server', serverId, 'organization:manage')
  const query = useServerAddresses(orgId, serverId, { enabled: canManage })
  if (!canManage || !query.data) return null
  return (
    <Link href={serverDetailTabHref(orgId, serverId, 'network') as Href} asChild>
      <Pressable style={webPointer} accessibilityRole="link">
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    </Link>
  )
}

const styles = StyleSheet.create({
  linkText: {
    color: colors.link,
    fontSize: 13,
    fontWeight: '600',
  },
})
