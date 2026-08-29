import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { AdminAreaIcon } from '@/components/icons/nav-icons'
import { ADMIN_AREAS, adminAreaHref } from '@/lib/admin-navigation'
import { glass } from '@/lib/glass'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

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
          const iconColor = areaActive ? chrome.accent : colors.textMuted

          return (
            <View key={area.id} style={styles.areaGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.areaItem,
                  areaActive && styles.areaItemActive,
                  pressed && styles.itemPressed,
                  webPointer,
                ]}
                onPress={() => {
                  router.push(areaHref as Href)
                  onNavigate?.()
                }}
              >
                {areaActive ? <View style={styles.areaActiveBar} /> : null}
                <AdminAreaIcon
                  areaId={area.id}
                  size={16}
                  color={iconColor}
                />
                <Text
                  style={[
                    styles.areaLabel,
                    areaActive && styles.areaLabelActive,
                  ]}
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
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  brand: {
    marginBottom: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandHint: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
  },
  nav: {
    flex: 1,
    gap: spacing.xs,
  },
  areaGroup: {
    gap: 2,
  },
  areaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  areaItemActive: {
    borderColor: glass.border,
    backgroundColor: glass.fillSoft,
  },
  areaActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1,
    backgroundColor: chrome.accent,
  },
  areaLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  areaLabelActive: {
    color: colors.text,
  },
  itemPressed: {
    opacity: 0.85,
  },
})
