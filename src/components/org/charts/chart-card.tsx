import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { colors } from '@/lib/theme'

export function ChartCard({
  title,
  subtitle,
  legend,
  unavailable,
  children,
}: Readonly<{
  title: string
  subtitle?: string
  legend?: ReactNode
  unavailable?: boolean
  children?: ReactNode
}>) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.body}>
        {legend}
        {unavailable ? (
          <Text style={orgPanelStyles.muted}>Metric unavailable for this range</Text>
        ) : (
          children
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgArea,
    overflow: 'hidden',
    flex: 1,
    minWidth: 280,
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: colors.bgAreaHeader,
    gap: 2,
  },
  title: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 11,
  },
  body: {
    padding: 14,
    gap: 10,
  },
})
