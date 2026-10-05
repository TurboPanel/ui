import { Pressable, StyleSheet, Text, View } from 'react-native'
import { usePathname, useRouter, type Href } from 'expo-router'
import { HighAvailabilityWordmark } from '@/components/brand/high-availability-wordmark'
import { TurboPanelLogo } from '@/components/brand/turbopanel-logo'
import { GlassSurface } from '@/components/glass/glass-surface'
import {
  AdminNavIcon,
  OrgAreaIcon,
} from '@/components/icons/nav-icons'
import { adminAreaHref } from '@/lib/admin-navigation'
import { isAdminSession, useAuth } from '@/lib/auth-context'
import {
  ORG_AREAS,
  ORG_SIDEBAR_AREA_IDS,
  ORG_SIDEBAR_MORE_AREA_IDS,
  isOrgAreaActive,
  orgAreaFromPathname,
  orgAreaHref,
  orgRouteHref,
  type OrgAreaId,
} from '@/lib/org-navigation'
import type { ProjectRecord } from '@/lib/instance-api'
import {
  isComposeProject,
  projectHref,
  recentProjectHref,
} from '@/lib/project-navigation'
import { useEnvironments } from '@/lib/queries/environments'
import { useProjects } from '@/lib/queries/projects'
import { resolveRecentProjects, useRecentProjectIds } from '@/lib/recent-projects'
import { glass } from '@/lib/glass'
import { chrome, colors, layout, spacing, webPointer } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import { projectsHrefForScope } from '@/lib/workspace-scope'

type SidebarArea = (typeof ORG_AREAS)[number]

function sidebarAreas(ids: readonly OrgAreaId[]): SidebarArea[] {
  return ids.flatMap((id) => {
    const area = ORG_AREAS.find((entry) => entry.id === id)
    return area ? [area] : []
  })
}

/** One area row, with its sub-routes open while the area is the active one. */
function SidebarAreaItem({
  area,
  orgId,
  onNavigate,
}: Readonly<{
  area: SidebarArea
  orgId: string
  onNavigate?: () => void
}>) {
  const pathname = usePathname()
  const router = useRouter()
  const { scopeId } = useWorkspaceScope()
  const activeSubRouteId = orgAreaFromPathname(pathname)?.subRoute?.id ?? null
  const areaHref =
    area.id === 'projects'
      ? projectsHrefForScope(orgId, scopeId)
      : orgAreaHref(orgId, area.pathSegment)
  const areaActive = isOrgAreaActive(pathname, orgId, area.pathSegment)
  const iconColor = areaActive ? chrome.accent : colors.textMuted

  return (
    <View style={styles.areaGroup}>
      <Pressable
        style={({ pressed }) => [
          styles.areaItem,
          areaActive && styles.areaItemActive,
          pressed && styles.itemPressed,
          webPointer,
        ]}
        accessibilityRole="link"
        accessibilityLabel={area.label}
        accessibilityState={{ selected: areaActive }}
        onPress={() => {
          router.push(areaHref as Href)
          onNavigate?.()
        }}
      >
        {areaActive ? <View style={styles.areaActiveBar} /> : null}
        <OrgAreaIcon areaId={area.id} size={16} color={iconColor} />
        <Text style={[styles.areaLabel, areaActive && styles.areaLabelActive]}>
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
                    style={[styles.subLabel, subActive && styles.subLabelActive]}
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
}

/**
 * One of the last projects opened. A Compose project with a single
 * environment opens that environment; anything else opens the project.
 */
function RecentProjectItem({
  orgId,
  project,
  onNavigate,
}: Readonly<{
  orgId: string
  project: ProjectRecord
  onNavigate?: () => void
}>) {
  const pathname = usePathname()
  const router = useRouter()
  const environmentsQuery = useEnvironments(orgId, project.id, {
    enabled: isComposeProject(project),
  })
  const href = recentProjectHref(
    orgId,
    project,
    environmentsQuery.data?.environments,
  )
  const active = pathname.startsWith(projectHref(orgId, project.id))
  const name = project.name?.trim() || 'Unnamed project'

  return (
    <Pressable
      style={({ pressed }) => [
        styles.recentItem,
        active && styles.recentItemActive,
        pressed && styles.itemPressed,
        webPointer,
      ]}
      accessibilityRole="link"
      accessibilityLabel={name}
      accessibilityState={{ selected: active }}
      onPress={() => {
        router.push(href as Href)
        onNavigate?.()
      }}
    >
      <Text
        style={[styles.recentLabel, active && styles.recentLabelActive]}
        numberOfLines={1}
      >
        {name}
      </Text>
    </Pressable>
  )
}

/** The last five projects opened on this device, newest first. */
function RecentProjects({
  orgId,
  onNavigate,
}: Readonly<{ orgId: string; onNavigate?: () => void }>) {
  const recentIds = useRecentProjectIds(orgId)
  const projectsQuery = useProjects(orgId)
  const recent = resolveRecentProjects(
    recentIds,
    projectsQuery.data?.projects ?? [],
  )
  if (recent.length === 0) return null
  return (
    <View style={styles.recent} accessibilityLabel="Recent projects">
      <Text style={styles.groupLabel}>Recent projects</Text>
      {recent.map((project) => (
        <RecentProjectItem
          key={project.id}
          orgId={orgId}
          project={project}
          onNavigate={onNavigate}
        />
      ))}
    </View>
  )
}

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
  const adminHref = adminAreaHref('access')
  const adminActive =
    pathname === adminHref || pathname.startsWith('/admin/')
  // Billing is not a sidebar area: it lives behind the organization menu
  // (hosted only), so people reach it when they need to buy, not in passing.
  const mainAreas = sidebarAreas(ORG_SIDEBAR_AREA_IDS)
  const moreAreas = sidebarAreas(ORG_SIDEBAR_MORE_AREA_IDS)

  return (
    <GlassSurface style={styles.sidebar} intensity="strong">
      <View style={styles.brand}>
        <View style={styles.brandRow}>
          <TurboPanelLogo size={36} />
          <HighAvailabilityWordmark />
        </View>
      </View>

      <View style={styles.nav}>
        {mainAreas.map((area) => (
          <SidebarAreaItem
            key={area.id}
            area={area}
            orgId={orgId}
            onNavigate={onNavigate}
          />
        ))}

        <RecentProjects orgId={orgId} onNavigate={onNavigate} />

        {moreAreas.length > 0 ? (
          <View style={styles.more}>
            <Text style={styles.groupLabel}>More</Text>
            {moreAreas.map((area) => (
              <SidebarAreaItem
                key={area.id}
                area={area}
                orgId={orgId}
                onNavigate={onNavigate}
              />
            ))}
          </View>
        ) : null}
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
            <AdminNavIcon
              size={16}
              color={adminActive ? colors.text : colors.textMuted}
            />
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
    </GlassSurface>
  )
}

const styles = StyleSheet.create({
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
  brand: {
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '100%',
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
    color: colors.link,
  },
  groupLabel: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.md,
    paddingBottom: 2,
  },
  recent: {
    marginTop: spacing.md,
    gap: 2,
  },
  recentItem: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  recentItemActive: {
    borderColor: colors.borderMuted,
    backgroundColor: chrome.bgActive,
  },
  recentLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  recentLabelActive: {
    color: colors.link,
    fontWeight: '600',
  },
  more: {
    marginTop: spacing.md,
    gap: spacing.xs,
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
    gap: spacing.sm,
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
