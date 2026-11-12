import { StyleSheet, Text, View } from 'react-native'
import { Badge } from '@/components/ui'
import { checkLabel } from '@/lib/connection-modes'
import type { IngressCheck } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

/** Preflight results: one line per check, Pass or Fail in words, and the plain detail. */
export function CheckList({ checks }: Readonly<{ checks: readonly IngressCheck[] }>) {
  if (checks.length === 0) return null
  return (
    <View style={styles.list}>
      {checks.map((check) => (
        <View key={check.id} style={styles.row}>
          <Badge label={check.ok ? 'Pass' : 'Fail'} tone={check.ok ? 'ok' : 'danger'} />
          <View style={styles.text}>
            <Text style={styles.label}>{checkLabel(check.id)}</Text>
            {check.detail ? <Text style={styles.detail}>{check.detail}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  detail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
})
