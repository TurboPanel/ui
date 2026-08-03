import { Link, usePathname, type Href } from 'expo-router'
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  COMPOSE_PROJECT_TAB_IDS,
  COMPOSE_PROJECT_TAB_LABELS,
  MANAGED_PROJECT_TAB_IDS,
  MANAGED_PROJECT_TAB_LABELS,
  isManagedProject,
  parseProjectEnvironmentId,
  projectTabHref,
  projectTypeLabel,
  type ProjectTabId,
} from '@/lib/project-navigation'
import { chrome, colors, layout, spacing } from '@/lib/theme'
import { isForbiddenError, updateProject } from '@/lib/instance-api'
import { useAuth } from '@/lib/auth-context'
import { useEffect, useState, type ReactNode } from 'react'

function activeTabFromPathname(
  pathname: string,
  projectId: string,
): ProjectTabId | 'setup' | null {
  const marker = `/projects/${projectId}/`
  const idx = pathname.indexOf(marker)
  if (idx < 0) {
    if (pathname.endsWith(`/projects/${projectId}`)) return 'overview'
    return null
  }
  const rest = pathname.slice(idx + marker.length)
  const segment = rest.split('/')[0] ?? ''
  if (segment === 'setup') return 'setup'
  // Service detail lives under /services/:id but belongs to Overview.
  if (segment === 'services') return 'overview'
  // `/environments/:id` is Overview with that environment selected (Base is
  // `/overview`). The Environments tab index is bare `/environments`.
  if (segment === 'environments' && parseProjectEnvironmentId(pathname, projectId)) {
    return 'overview'
  }
  if (
    (COMPOSE_PROJECT_TAB_IDS as readonly string[]).includes(segment) ||
    (MANAGED_PROJECT_TAB_IDS as readonly string[]).includes(segment)
  ) {
    return segment as ProjectTabId
  }
  return 'overview'
}

function EnvironmentSelector() {
  const {
    environments,
    selectedEnvironmentId,
    setSelectedEnvironmentId,
  } = useProjectContext()

  if (environments.length === 0) {
    return (
      <Text style={orgPanelStyles.muted} accessibilityRole="text">
        No environments
      </Text>
    )
  }

  if (environments.length === 1) {
    const only = environments[0]!
    return (
      <View style={styles.envSingle} accessibilityLabel="Active environment">
        <Text style={styles.envSingleLabel}>Environment</Text>
        <Text style={styles.envSingleName}>
          {only.displayName?.trim() || 'Environment'}
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.envChips}
      accessibilityRole="tablist"
      accessibilityLabel="Environments"
    >
      {environments.map((env) => {
        const active = env.id === selectedEnvironmentId
        return (
          <Pressable
            key={env.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={env.displayName?.trim() || 'Environment'}
            style={[styles.envChip, active && styles.envChipActive, webPointer]}
            onPress={() => setSelectedEnvironmentId(env.id)}
          >
            <Text
              style={[styles.envChipText, active && styles.envChipTextActive]}
              numberOfLines={1}
            >
              {env.displayName?.trim() || 'Environment'}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

function ProjectTabBar({
  orgId,
  projectId,
  tabs,
  labels,
  activeTab,
}: Readonly<{
  orgId: string
  projectId: string
  tabs: readonly ProjectTabId[]
  labels: Record<string, string>
  activeTab: ProjectTabId | 'setup' | null
}>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabBar}
      accessibilityRole="tablist"
      accessibilityLabel="Project sections"
    >
      {tabs.map((tabId) => {
        const active = activeTab === tabId
        const href = projectTabHref(orgId, projectId, tabId) as Href
        const tabStyle = StyleSheet.flatten([
          styles.tab,
          active && styles.tabActive,
          webPointer,
        ])
        return (
          <Link key={tabId} href={href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={labels[tabId] ?? tabId}
              style={tabStyle}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {labels[tabId] ?? tabId}
              </Text>
            </Pressable>
          </Link>
        )
      })}
    </ScrollView>
  )
}

function ProjectHeader() {
  const {
    project,
    canOwn,
    setProject,
    setError,
  } = useProjectContext()
  const { handleUnauthorized } = useAuth()
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setEditName(project?.displayName?.trim() ?? '')
  }, [project?.displayName, project?.id])

  if (!project) return null

  const saveName = async () => {
    const trimmed = editName.trim()
    if (trimmed === (project.displayName?.trim() ?? '')) return
    setSaving(true)
    setError(null)
    try {
      await updateProject(project.id, { displayName: trimmed || undefined })
      setProject({ ...project, displayName: trimmed || null })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save name')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.header}>
      <View style={styles.headerRow}>
        {canOwn ? (
          <TextInput
            value={editName}
            onChangeText={setEditName}
            onBlur={() => {
              void saveName()
            }}
            onSubmitEditing={() => {
              void saveName()
            }}
            placeholder="Project name"
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Project name"
            style={[
              styles.titleInput,
              Platform.OS === 'web' ? titleInputWebStyle : null,
            ]}
          />
        ) : (
          <Text style={styles.titleText} accessibilityRole="header">
            {project.displayName?.trim() || 'Unnamed project'}
          </Text>
        )}
        <View
          style={
            projectTypeLabel(project) === 'Setup'
              ? styles.badgeMuted
              : styles.badgeAccent
          }
        >
          <Text
            style={
              projectTypeLabel(project) === 'Setup'
                ? styles.badgeMutedText
                : styles.badgeAccentText
            }
          >
            {projectTypeLabel(project)}
          </Text>
        </View>
      </View>
      {saving ? <Text style={orgPanelStyles.muted}>Saving…</Text> : null}
    </View>
  )
}

export function ProjectShell({ children }: Readonly<{ children: ReactNode }>) {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const {
    orgId,
    projectId,
    project,
    loading,
    error,
    needsSetup,
  } = useProjectContext()

  const activeTab = activeTabFromPathname(pathname, projectId)
  const managed = project ? isManagedProject(project) : false
  const tabs = managed ? MANAGED_PROJECT_TAB_IDS : COMPOSE_PROJECT_TAB_IDS
  const labels = managed
    ? MANAGED_PROJECT_TAB_LABELS
    : COMPOSE_PROJECT_TAB_LABELS

  const backStyle = StyleSheet.flatten([styles.backLink, webPointer])
  const hideEnvSelector =
    activeTab === 'environments' || activeTab === 'overview'

  if (loading && !project) {
    return (
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        <Text style={orgPanelStyles.muted}>Loading project…</Text>
      </View>
    )
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingBottom: Math.max(insets.bottom, spacing.md),
          paddingTop: Platform.OS === 'web' ? 0 : Math.max(insets.top - 8, 0),
        },
      ]}
    >
      <Link href={`/${orgId}/projects` as Href} asChild>
        <Pressable
          style={backStyle}
          accessibilityRole="link"
          accessibilityLabel="Back to projects"
        >
          <Text style={styles.backLinkText}>← Projects</Text>
        </Pressable>
      </Link>

      <ProjectHeader />

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {needsSetup || activeTab === 'setup' ? null : (
        <>
          {hideEnvSelector ? null : <EnvironmentSelector />}
          <ProjectTabBar
            orgId={orgId}
            projectId={projectId}
            tabs={tabs}
            labels={labels}
            activeTab={activeTab}
          />
        </>
      )}

      <View style={styles.body}>{children}</View>
    </View>
  )
}

const titleInputWebStyle = {
  outlineStyle: 'none',
  borderWidth: 0,
  backgroundColor: 'transparent',
} as unknown as TextStyle

const styles = StyleSheet.create({
  root: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  backLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  backLinkText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  titleInput: {
    flex: 1,
    minWidth: 160,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    paddingVertical: 0,
    minHeight: 44,
  },
  titleText: {
    flex: 1,
    minWidth: 160,
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  badgeAccent: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: 'center',
  },
  badgeAccentText: {
    color: chrome.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badgeMuted: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 28,
    justifyContent: 'center',
  },
  badgeMutedText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  envSingle: {
    gap: 2,
  },
  envSingleLabel: {
    color: colors.textLabel,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  envSingleName: {
    color: colors.textBody,
    fontSize: 15,
    fontWeight: '600',
  },
  envChips: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  envChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: 200,
  },
  envChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  envChipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  envChipTextActive: {
    color: chrome.accent,
  },
  tabBar: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderArea,
  },
  tab: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderChip,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  tabActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  tabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: chrome.accent,
  },
  body: {
    width: '100%',
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
})
