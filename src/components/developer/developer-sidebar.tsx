import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors, layout } from '@/lib/theme'

export function DeveloperSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>TurboPanel</Text>
        <Text style={styles.brandHint}>Developer console · dev only</Text>
      </View>

      <View style={styles.nav}>
        {DEVELOPER_SECTIONS.map((section) => {
          const active = pathname === section.path
          return (
            <Pressable
              key={section.id}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => {
                router.push(section.path)
                onNavigate?.()
              }}
            >
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {section.label}
              </Text>
            </Pressable>
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
    gap: 4,
  },
  navItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  navLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  navLabelActive: {
    color: colors.accent,
  },
})
