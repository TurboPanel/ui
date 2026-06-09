import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { dashboardHref, useAuth } from '@/lib/auth-context'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { colors, layout } from '@/lib/theme'

export function DeveloperSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { session, needsInstall } = useAuth()
  const exitHref = dashboardHref(session, needsInstall)

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>TurboPanel</Text>
        <Text style={styles.brandHint}>Developer console · dev only</Text>
      </View>

      <Pressable
        style={styles.exitButton}
        onPress={() => {
          router.push(exitHref as Href)
          onNavigate?.()
        }}
      >
        <Text style={styles.exitLabel}>← Organization console</Text>
      </Pressable>

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
  exitButton: {
    marginHorizontal: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgInput,
  },
  exitLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
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
