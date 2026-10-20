import { StyleSheet, Text, View } from 'react-native'
import { Badge } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

/**
 * A service or site taken out of the compose file. It has no containers, so
 * the Containers list would otherwise skip it; its folder is still on the
 * server as an orphan and is listed in the folders panel above or below.
 */
export function RemovedServiceCard({
  name,
  foldersWhere,
}: Readonly<{ name: string; foldersWhere: 'above' | 'below' }>) {
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <Text style={panelStyles.detailTitle}>{name}</Text>
        <Badge label="Removed from compose" tone="danger" />
      </View>
      <Text style={panelStyles.muted}>
        It is no longer served, but its folder is still on the server. See Folders on your servers{' '}
        {foldersWhere}.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
})
