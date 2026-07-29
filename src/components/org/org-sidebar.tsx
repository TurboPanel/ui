import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import { ORG_AREAS, orgAreaHref, orgRouteHref } from '@/lib/org-navigation'
import { webPointer } from '@/components/org/org-panel-styles'
import { colors, layout, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import { projectsHrefForScope } from '@/lib/workspace-scope'

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
  const { scopeId } = useWorkspaceScope()
  const showAdminLink = isAdminSession(session)
  const adminHref = adminAreaHref('networking')
  const adminActive =
    pathname === adminHref || pathname.startsWith('/admin/')

  return (
    <View style={styles.sidebar}>
      <View style={styles.brand}>
        <View style={styles.brandStripe} accessibilityElementsHidden>
          <View style={styles.brandStripeGreen} />
          <View style={styles.brandStripeBlue} />
        </View>
        <View style={styles.brandCopy}>
          <View style={styles.brandTitleRow}>
            <View style={styles.brandDot} />
            <Text style={styles.brandTitle}>TurboPanel</Text>
          </View>
        </View>
      </View>

      <View style={styles.nav}>
        {ORG_AREAS.map((area) => {
          const areaHref =
            area.id === 'projects'
              ? projectsHrefForScope(orgId, scopeId)
              : orgAreaHref(orgId, area.pathSegment)
          const projectsBase = orgAreaHref(orgId, 'projects')
          const areaActive =
            area.id === 'projects'
              ? pathname === projectsBase ||
                pathname.startsWith(`${projectsBase}/`)
              : pathname === areaHref || pathname.startsWith(`${areaHref}/`)

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
                <Text
                  style={[
                    styles.areaLabel,
                    areaActive && styles.areaLabelActive,
                  ]}
                >
                  {area.label}
                </Text>
              </Pressable>

              {areaActive && area.subRoutes.length > 0 ? (
                <View style={styles.subNav}>
                  <View style={styles.subNavRail} />
                  <View style={styles.subNavItems}>
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
                          style={({ pressed }) => [
                            styles.subItem,
                            subActive && styles.subItemActive,
                            pressed && styles.itemPressed,
                            webPointer,
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
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      {showAdminLink ? (
        <View style={styles.adminNav}>
          <Text style={styles.adminNavLabel}>Platform</Text>
          <Pressable
            style={({ pressed }) => [
              styles.adminItem,
              adminActive && styles.adminItemActive,
              pressed && styles.itemPressed,
              webPointer,
            ]}
            onPress={() => {
              router.push(adminHref as Href)
              onNavigate?.()
            }}
          >
            {adminActive ? <View style={styles.areaActiveBar} /> : null}
            <Text
              style={[
                styles.adminLabel,
                adminActive && styles.adminLabelActive,
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
    alignSelf: 'stretch',
    backgroundColor: colors.bgSidebar,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  brandStripe: {
    width: 3,
    borderRadius: 2,
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  brandStripeGreen: {
    flex: 1,
    backgroundColor: colors.green,
  },
  brandStripeBlue: {
    flex: 1,
    backgroundColor: colors.blue,
  },
  brandCopy: {
    flex: 1,
    gap: 2,
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  brandTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
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
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  areaItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgSecondary,
  },
  areaActiveBar: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  areaLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  areaLabelActive: {
    color: colors.text,
  },
  subNav: {
    flexDirection: 'row',
    paddingLeft: spacing.md,
    marginTop: 2,
  },
  subNavRail: {
    width: 1,
    backgroundColor: colors.borderArea,
    marginRight: spacing.sm,
    marginVertical: 4,
  },
  subNavItems: {
    flex: 1,
    gap: 2,
  },
  subItem: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgActive,
  },
  subLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  subLabelActive: {
    color: colors.accent,
  },
  adminNav: {
    marginTop: 'auto',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.xs,
  },
  adminNavLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
  },
  adminItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  adminItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgSecondary,
  },
  adminLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  adminLabelActive: {
    color: colors.text,
  },
  itemPressed: {
    opacity: 0.85,
  },
})
