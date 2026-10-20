import { Link, type Href } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'
import { Badge } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { colors, spacing } from '@/lib/theme'

/**
 * A service or site taken out of the compose file. It has no containers, so
 * the Containers list would otherwise skip it; its folder is still on the
 * server as an orphan, and the link goes to where that folder is listed.
 */
export function RemovedServiceCard({
  name,
  foldersHref,
}: Readonly<{ name: string; foldersHref: string }>) {
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <Text style={panelStyles.detailTitle}>{name}</Text>
        <Badge label="Removed from compose" tone="danger" />
      </View>
      <Text style={panelStyles.muted}>
        It is no longer served, but its folder is still on the server.
      </Text>
      <Link href={foldersHref as Href} style={styles.link} accessibilityRole="link">
        See its folder
      </Link>
    </View>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  link: { color: colors.link, fontSize: 13, marginTop: spacing.xs },
})
