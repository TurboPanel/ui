import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { ADMIN_AREAS, adminAreaHref } from '@/lib/admin-navigation'
import { colors, layout } from '@/lib/theme'

export function AdminSidebar({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }>) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>TurboPanel</Text>
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
    </View>
  )
}

const styles = StyleSheet.create({
  sidebar: {
    width: layout.sidebarWidth,
    flexShrink: 0,
    backgroundColor: colors.bgSidebar,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 20,
  },
  brand: {
    paddingHorizontal: 8,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  brandHint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 4,
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
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgSecondary,
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
