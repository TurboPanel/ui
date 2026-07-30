import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { ADMIN_AREAS, adminAreaHref } from '@/lib/admin-navigation'
import { glass } from '@/lib/glass'
import { colors, layout, spacing } from '@/lib/theme'

export function AdminSidebar({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }>) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <GlassSurface style={styles.sidebar} intensity="strong">
      <View style={styles.brand}>
        <TurboPanelLogo size={36} />
        <Text style={styles.brandHint}>Instance administration</Text>
      </View>

      <View style={styles.nav}>
        {ADMIN_AREAS.map((area) => {
          const areaHref = adminAreaHref(area.pathSegment)
          const areaActive =
            pathname === areaHref || pathname.startsWith(`${areaHref}/`)

          return (
            <View key={area.id} style={styles.areaGroup}>
              <Pressable
                style={[styles.areaItem, areaActive && styles.areaItemActive]}
                onPress={() => {
                  router.push(areaHref as Href)
                  onNavigate?.()
                }}
              >
                <Text
                  style={[styles.areaLabel, areaActive && styles.areaLabelActive]}
                >
                  {area.label}
                </Text>
              </Pressable>
            </View>
          )
        })}
      </View>
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.sidebarWidth,
    flexShrink: 0,
    alignSelf: 'stretch',
    borderRadius: 0,
    borderWidth: 0,
    borderRightWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 20,
  },
  brand: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  brandHint: {
    color: colors.textDim,
    fontSize: 11,
  },
  nav: {
    gap: 8,
  },
  areaGroup: {
    gap: 4,
  },
  areaItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  areaItemActive: {
    borderColor: glass.border,
    backgroundColor: glass.fillSoft,
  },
  areaLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  areaLabelActive: {
    color: colors.text,
  },
})
