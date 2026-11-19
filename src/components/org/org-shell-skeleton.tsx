import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { glass } from '@/lib/glass'
import { colors, layout, spacing } from '@/lib/theme'

const NAV_PLACEHOLDERS = [0, 1, 2, 3, 4] as const
const CARD_PLACEHOLDERS = [0, 1, 2] as const

function Bar({ width, height = 12 }: Readonly<{ width: number | `${number}%`; height?: number }>) {
  return <View style={[styles.bar, { width, height }]} />
}

/**
 * The organization chrome drawn with placeholders while membership is checked.
 * It makes no request and takes no organization id, so nothing about an
 * organization shows before the person is known to belong to it.
 */
export function OrgShellSkeleton() {
  const { width } = useWindowDimensions()
  const isDesktop = width >= layout.desktopBreakpoint
  return (
    <SafeAreaView style={styles.safe} accessibilityLabel="Loading">
      <View style={styles.root}>
        {isDesktop ? (
          <GlassSurface style={styles.sidebar} intensity="strong">
            <View style={styles.brand}>
              <TurboPanelLogo size={36} />
            </View>
            <View style={styles.nav}>
              {NAV_PLACEHOLDERS.map((index) => (
                <View key={index} style={styles.navItem}>
                  <Bar width="70%" />
                </View>
              ))}
            </View>
          </GlassSurface>
        ) : null}
        <View style={styles.main}>
          <GlassSurface style={styles.header} intensity="strong" rim="bottom">
            {isDesktop ? null : <TurboPanelLogo size={28} />}
            <Bar width={160} height={14} />
          </GlassSurface>
          <View style={styles.content}>
            <Bar width={220} height={22} />
            {CARD_PLACEHOLDERS.map((index) => (
              <View key={index} style={styles.card}>
                <Bar width="40%" height={14} />
                <Bar width="65%" />
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  sidebar: {
    width: layout.sidebarWidth,
    flexGrow: 1,
    flexShrink: 0,
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    borderRightWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  brand: { marginBottom: spacing.xl, alignItems: 'center' },
  nav: { flex: 1, gap: spacing.xs },
  navItem: { paddingVertical: 9, paddingHorizontal: spacing.md },
  main: { flex: 1, minWidth: 0, backgroundColor: colors.bg },
  header: {
    borderRadius: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  content: { padding: spacing.xl, gap: spacing.lg },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: glass.border,
    backgroundColor: glass.fillSoft,
  },
  bar: { borderRadius: 6, backgroundColor: glass.border },
})
