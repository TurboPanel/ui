import { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { chrome, colors, spacing } from '@/lib/theme'

export function ChartCard({
  title,
  subtitle,
  legend,
  headline,
  unavailable,
  accent = true,
  children,
}: Readonly<{
  title: string
  subtitle?: string
  legend?: ReactNode
  headline?: string
  unavailable?: boolean
  accent?: boolean
  children?: ReactNode
}>) {
  return (
    <View style={styles.card}>
      <View style={[styles.header, accent && styles.headerAccent]}>
        {accent ? <View style={styles.accentStripe} /> : null}
        <View style={styles.headerCopy}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>{title}</Text>
            {headline ? (
              <Text style={styles.headline} numberOfLines={1}>
                {headline}
              </Text>
            ) : null}
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>
        {legend}
        {unavailable ? (
          <View style={styles.unavailableBlock}>
            <View style={styles.unavailableDot} />
            <Text style={panelStyles.muted}>
              Metric unavailable for this range
            </Text>
          </View>
        ) : (
          <View style={styles.plotFrame}>{children}</View>
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
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
    backgroundColor: colors.bgAreaHeader,
  },
  headerAccent: {
    backgroundColor: colors.bgInset,
  },
  accentStripe: {
    width: 3,
    backgroundColor: chrome.accent,
  },
  headerCopy: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    minWidth: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minWidth: 0,
  },
  title: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
    flexShrink: 1,
  },
  headline: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  body: {
    padding: 14,
    gap: spacing.sm,
  },
  plotFrame: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  unavailableBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderArea,
    backgroundColor: colors.bgInset,
  },
  unavailableDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
  },
})
