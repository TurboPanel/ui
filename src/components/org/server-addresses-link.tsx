import { useRouter, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text } from 'react-native'
import { serverDetailTabHref } from '@/lib/org-navigation'
import { colors, webPointer } from '@/lib/theme'

/** Opens the server's Network tab, where the "Addresses clients use" card sits on top. */
export function ServerAddressesLink({
  orgId,
  serverId,
  label,
}: Readonly<{ orgId: string; serverId: string; label: string }>) {
  const router = useRouter()
  return (
    <Pressable
      onPress={() => router.push(serverDetailTabHref(orgId, serverId, 'network') as Href)}
      style={webPointer}
      accessibilityRole="link"
    >
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  linkText: {
    color: colors.link,
    fontSize: 13,
    fontWeight: '600',
  },
})
