import { Link, usePathname, type Href } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ComposeEditorIcon,
  ComposeOverviewIcon,
  ComposeVisualIcon,
} from '@/components/org/compose-view-icons'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  COMPOSE_PROJECT_LENS_IDS,
  COMPOSE_PROJECT_TAB_LABELS,
  DRAFT_COMPOSE_PROJECT_TAB_IDS,
  parseComposeProjectTab,
  parseProjectEnvironmentId,
  projectComposeSectionHref,
  type ComposeProjectTabId,
} from '@/lib/project-navigation'
import { chrome, colors } from '@/lib/theme'

/**
 * Icon per lens. Services reuses the service-cards glyph because that is what
 * it renders — the compose services as rows, not a diagram.
 */
const LENS_ICONS = {
  map: ComposeOverviewIcon,
  compose: ComposeEditorIcon,
  overview: ComposeVisualIcon,
} as const satisfies Partial<
  Record<ComposeProjectTabId, typeof ComposeEditorIcon>
>

type LensId = keyof typeof LENS_ICONS

function isLens(tabId: ComposeProjectTabId): tabId is LensId {
  return tabId in LENS_ICONS
}

function LensFace({
  tabId,
  active,
}: Readonly<{ tabId: LensId; active: boolean }>) {
  const Icon = LENS_ICONS[tabId]
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
 * Lens bar: **Overview · Compose · Services** — three representations of one
 * compose artifact, not a list of places.
 *
 * The project editor deliberately has no section nav. Hosting, Storage,
 * Servers, and Settings are reached from the object they belong to (a
 * service's gutter fact in the Services lens, or the scope-strip gear), which
 * is why this bar stays three items wide however much the project grows.
 */
export function ComposeSurfaceNav() {
  const pathname = usePathname()
  const { orgId, projectId, draft } = useProjectContext()
  const pathEnvironmentId = parseProjectEnvironmentId(pathname, projectId)
  const activeTab = draft
    ? draft.section
    : parseComposeProjectTab(pathname, projectId)
  const lensIds = draft
    ? DRAFT_COMPOSE_PROJECT_TAB_IDS
    : COMPOSE_PROJECT_LENS_IDS

  return (
    <View style={styles.bar}>
      <View style={[orgPanelStyles.segmentGroup, styles.group]}>
        {lensIds.filter(isLens).map((tabId) => {
          // A non-lens route (Storage, Settings, …) keeps Services lit: those
          // are configuration reached from a service row, not a fourth lens.
          const active = isLens(activeTab)
            ? activeTab === tabId
            : tabId === 'overview'
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
                <LensFace tabId={tabId} active={active} />
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
                <LensFace tabId={tabId} active={active} />
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
