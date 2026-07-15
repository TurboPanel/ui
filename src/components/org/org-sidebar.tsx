import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { ORG_AREAS, orgAreaHref, orgRouteHref } from '@/lib/org-navigation'
import { colors, layout } from '@/lib/theme'

export function OrgSidebar({
  orgId,
  onNavigate,
}: Readonly<{
  orgId: string
  onNavigate?: () => void
}>) {
  const { session } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const showAdminLink = isAdminSession(session)
  const adminHref = adminAreaHref('networking')

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <Text style={styles.brandTitle}>TurboPanel</Text>
        <Text style={styles.brandHint}>Organization console</Text>
      </View>

      <View style={styles.nav}>
        {ORG_AREAS.map((area) => {
          const areaHref = orgAreaHref(orgId, area.pathSegment)
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

              {areaActive && area.subRoutes.length > 0 ? (
                <View style={styles.subNav}>
                  {area.subRoutes.map((subRoute) => {
                    const subHref = orgRouteHref(
                      orgId,
                      area.pathSegment,
                      subRoute.pathSegment,
                    )
                    const subActive = pathname === subHref

                    return (
                      <Pressable
                        key={subRoute.id}
                        style={[
                          styles.subItem,
                          subActive && styles.subItemActive,
                        ]}
                        onPress={() => {
                          router.push(subHref as Href)
                          onNavigate?.()
                        }}
                      >
                        <Text
                          style={[
                            styles.subLabel,
                            subActive && styles.subLabelActive,
                          ]}
                        >
                          {subRoute.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {showAdminLink ? (
        <View style={styles.adminNav}>
          <Pressable
            style={[
              styles.adminItem,
              (pathname === adminHref || pathname.startsWith('/admin/')) &&
                styles.adminItemActive,
            ]}
            onPress={() => {
              router.push(adminHref as Href)
              onNavigate?.()
            }}
          >
            <Text
              style={[
                styles.adminLabel,
                (pathname === adminHref || pathname.startsWith('/admin/')) &&
                  styles.adminLabelActive,
              ]}
            >
              Admin
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  subNav: {
    gap: 2,
    paddingLeft: 10,
  },
  subItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subItemActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  subLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  subLabelActive: {
    color: colors.accent,
  },
  adminNav: {
    marginTop: 'auto',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  adminItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  adminItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgSecondary,
  },
  adminLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  adminLabelActive: {
    color: colors.text,
  },
})
