import { StyleSheet, Text, View } from 'react-native'
import { CopyButton } from '@/components/ui/copy-button'
import { panelStyles } from '@/components/ui/panel-styles'
import { colors, spacing } from '@/lib/theme'

/** A label over a monospace value with an optional Copy button; `fallback` reads in its place when there is no value. */
export function FingerprintLine({
  label,
  value,
  fallback = 'Not set',
  copy = true,
}: Readonly<{
  label: string
  value: string | null | undefined
  fallback?: string
  copy?: boolean
}>) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <>
          <Text selectable style={styles.mono}>
            {value}
          </Text>
          {copy ? (
            <CopyButton value={value} label="Copy" accessibilityLabel={`Copy ${label}`} />
          ) : null}
        </>
      ) : (
        <Text style={panelStyles.muted}>{fallback}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  line: { gap: spacing.xs },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  mono: { color: colors.stdout, fontFamily: 'monospace', fontSize: 13 },
})
