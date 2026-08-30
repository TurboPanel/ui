import { Link, usePathname, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ComposeEditorIcon,
  ComposeHostingIcon,
  ComposeOverviewIcon,
  ComposeVisualIcon,
} from '@/components/org/compose-view-icons'
import { BindingResourceIcon } from '@/components/icons/resource-icons'
import { panelStyles } from '@/components/ui/panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  COMPOSE_PROJECT_SURFACE_TAB_IDS,
  COMPOSE_PROJECT_TAB_LABELS,
  DRAFT_COMPOSE_PROJECT_TAB_IDS,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeSectionHref,
  type ComposeProjectTabId,
} from '@/lib/project-navigation'
import { chrome, colors, webPointer } from '@/lib/theme'

/**
 * Icon per nav tab. Services reuses the service-cards glyph because that is
 * what it renders — the compose services as rows, not a diagram. Hosting is
 * the globe (server placement and exposure); Bindings is the chain links
 * (system users and bound databases).
 */
const NAV_TAB_ICONS = {
  overview: ComposeOverviewIcon,
  compose: ComposeEditorIcon,
  services: ComposeVisualIcon,
  hosting: ComposeHostingIcon,
  bindings: BindingResourceIcon,
} as const satisfies Partial<
  Record<ComposeProjectTabId, typeof ComposeEditorIcon>
>

type NavTabId = keyof typeof NAV_TAB_ICONS

function isNavTab(tabId: ComposeProjectTabId): tabId is NavTabId {
  return tabId in NAV_TAB_ICONS
}

function NavTabFace({
  tabId,
  active,
}: Readonly<{ tabId: NavTabId; active: boolean }>) {
  const Icon = NAV_TAB_ICONS[tabId]
  return (
    <View style={styles.face}>
      <Icon size={14} color={active ? chrome.accent : colors.textMuted} />
      <Text style={[styles.label, active && styles.labelActive]}>
        {COMPOSE_PROJECT_TAB_LABELS[tabId]}
      </Text>
    </View>
  )
}

/**
 * Surface nav: **Overview · Compose · Services · Hosting · Bindings** — the
 * three lenses on one compose artifact, plus Hosting (server placement and
 * exposure: hostnames / proxying / TLS) and Bindings (system users and bound
 * databases: what a service deploys as and connects to).
 *
 * Storage and Settings stay off this bar — they are reached from the object
 * they belong to (a service's gutter fact in the Services lens, or the
 * scope-strip gear). Create-wizard drafts show the lenses only.
 */
export function ComposeSurfaceNav() {
  const pathname = usePathname()
  const { orgId, projectId, draft } = useProjectContext()
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const activeTab = draft
    ? draft.section
    : parseComposeProjectTab(pathname, projectId)
  const tabIds = draft
    ? DRAFT_COMPOSE_PROJECT_TAB_IDS
    : COMPOSE_PROJECT_SURFACE_TAB_IDS

  return (
    <View style={styles.bar}>
      <View style={[panelStyles.segmentGroup, styles.group]}>
        {tabIds.filter(isNavTab).map((tabId) => {
          // An off-bar route (Storage, Settings) keeps Services lit: those
          // are configuration reached from a service row, not a fifth tab.
          const active = isNavTab(activeTab)
            ? activeTab === tabId
            : tabId === 'services'
          const style = StyleSheet.flatten([
            styles.lens,
            active && styles.lensActive,
            webPointer,
          ])

          if (draft) {
            return (
              <Pressable
                key={tabId}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={COMPOSE_PROJECT_TAB_LABELS[tabId]}
                style={style}
                onPress={() => draft.setSection(tabId)}
              >
                <NavTabFace tabId={tabId} active={active} />
              </Pressable>
            )
          }

          return (
            <Link
              key={tabId}
              href={
                projectComposeSectionHref(
                  orgId,
                  projectId,
                  tabId,
                  pathEnvironmentId,
                ) as Href
              }
              asChild
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={COMPOSE_PROJECT_TAB_LABELS[tabId]}
                style={style}
              >
                <NavTabFace tabId={tabId} active={active} />
              </Pressable>
            </Link>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingVertical: 6,
  },
  group: {
    flexWrap: 'nowrap',
    padding: 2,
    borderRadius: 8,
  },
  lens: {
    minHeight: 26,
    borderRadius: 6,
    paddingHorizontal: 9,
    justifyContent: 'center',
  },
  lensActive: {
    backgroundColor: chrome.bgActive,
  },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: chrome.accent,
    fontWeight: '700',
  },
})
