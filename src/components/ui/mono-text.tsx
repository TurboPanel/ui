import { StyleSheet, Text, type TextProps } from 'react-native'
import { colors } from '@/lib/theme'

/**
 * Monospace value text for hostnames, IDs, commands, and paths
 * (MASTER: mono for machine-ish values, 13px on `textBody`).
 */
export function MonoText({
  style,
  ...props
}: Readonly<TextProps>) {
  return <Text {...props} style={[styles.mono, style]} />
}

const styles = StyleSheet.create({
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.textBody,
  },
})
