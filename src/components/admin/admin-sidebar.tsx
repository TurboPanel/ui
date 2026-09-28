import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { useUpdateAvailable } from '@/components/admin/updates/update-available-banner'
import { HighAvailabilityWordmark } from '@/components/brand/high-availability-wordmark'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import { Badge } from '@/components/ui'
import { AdminAreaIcon } from '@/components/icons/nav-icons'
import { ADMIN_AREAS, adminAreaFromPathname, adminAreaHref, adminRouteHref } from '@/lib/admin-navigation'
import { useAuth } from '@/lib/auth-context'
import { glass } from '@/lib/glass'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'

export function AdminSidebar({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }>) {
  const pathname = usePathname()
  const router = useRouter()
  const { billingEnabled, controlPlaneRuntime } = useAuth()
  const { available: updateAvailable } = useUpdateAvailable()
  const resolved = adminAreaFromPathname(pathname)
  const activeSubRouteId = resolved?.subRoute?.id ?? null
  const isWorkers = controlPlaneRuntime === 'workers'
  // The tier catalogue is a hosted (Workers) surface; self-hosted has no
  // billing and no `/tiers` routes, so the entry is omitted rather than 404ing.
  // Access (hostnames/certificates/ACME/trusted proxies/tunnel/Platform CA)
  // is the reverse: every one of its sections is self-hosted-only — Cloudflare
  // owns TLS, the client address, and the co-located-daemon concept it all
  // assumes — so the whole area is omitted on Workers rather than linking to
  // a page of "not applicable here" notices.
  const areas = ADMIN_AREAS.filter(
    (area) =>
      (area.id !== 'tiers' || billingEnabled) &&
      (area.id !== 'access' || !isWorkers),
  )

  return (
    <GlassSurface style={styles.sidebar} intensity="strong">
      <View style={styles.brand}>
        <View style={styles.brandRow}>
          <TurboPanelLogo size={36} />
          <HighAvailabilityWordmark />
        </View>
        <Text style={styles.brandHint}>Instance administration</Text>
      </View>

      <View style={styles.nav}>
        {areas.map((area) => {
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
                {area.id === 'updates' && updateAvailable ? (
                  <Badge tone="info" label="New" />
                ) : null}
              </Pressable>

              {areaActive && area.subRoutes.length > 0 ? (
                <View style={styles.subNav}>
                  <View style={styles.subNavRail} />
                  <View style={styles.subNavItems}>
                    {area.subRoutes.map((subRoute) => {
                      const subHref = adminRouteHref(
                        area.pathSegment,
                        subRoute.pathSegment,
                      )
                      const subActive =
                        activeSubRouteId === subRoute.id ||
                        pathname === subHref ||
                        pathname.startsWith(`${subHref}/`)

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
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  subItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: chrome.bgActive,
  },
  subLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  subLabelActive: {
    color: chrome.accent,
  },
  itemPressed: {
    opacity: 0.85,
  },
})
