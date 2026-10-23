import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/theme'

/** Muted line at the bottom of the server metrics page naming the metrics layout the panel serves. */
export function ServerMetricsVersion({ version }: Readonly<{ version?: number | null }>) {
  if (typeof version !== 'number' || !Number.isFinite(version)) return null
  return (
    <View style={styles.row}>
      <Text style={styles.text}>{`Server Metrics Version ${version}`}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    width: '100%',
  },
  text: {
    color: colors.textFaint,
    fontSize: 11,
    lineHeight: 15,
  },
})
