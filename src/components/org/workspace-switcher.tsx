import { useRouter, type Href } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { HeaderChevron } from '@/components/header-chevron'
import { PlatformBadge } from '@/components/org/platform-badge'
import { webPointer } from '@/components/org/org-panel-styles'
import type { WorkspaceRecord } from '@/lib/instance-api'
import { useCan } from '@/lib/query-client'
import {
  findTurbopanelWorkspace,
  isTurbopanelWorkspace,
  userWorkspaces,
} from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import {
  ALL_WORKSPACES_SCOPE,
  manageWorkspacesHref,
  workspaceName,
  type WorkspaceScope,
} from '@/lib/workspace-scope'

function matchesWorkspaceQuery(
  workspace: WorkspaceRecord,
  query: string,
): boolean {
  if (!query) {
    return true
  }
  const name = workspaceName(workspace).toLowerCase()
  return name.includes(query)
}

function triggerLabelForScope(
  scope: WorkspaceScope,
  isLoading: boolean,
  workspaceCount: number,
): string {
  if (isLoading && workspaceCount === 0) {
    return 'Loading…'
  }
  return scope.label
}

function WorkspaceMenuItem({
  active,
  label,
  badge,
  onPress,
}: Readonly<{
  active: boolean
  label: string
  badge?: boolean
  onPress: () => void
}>) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.menuItem,
        active && styles.menuItemActive,
        pressed && styles.menuItemPressed,
        webPointer,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <View style={styles.menuItemRow}>
        <Text
          style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {badge ? <PlatformBadge /> : null}
      </View>
    </Pressable>
  )
}

function WorkspaceResultsList({
  showAllOption,
  allActive,
  onSelectAll,
  emptyWithoutQuery,
  hasNoMatches,
  queryLabel,
  filteredUsers,
  scopeId,
  onSelectWorkspace,
  showPlatform,
  platformWorkspace,
}: Readonly<{
  showAllOption: boolean
  allActive: boolean
  onSelectAll: () => void
  emptyWithoutQuery: boolean
  hasNoMatches: boolean
  queryLabel: string
  filteredUsers: readonly WorkspaceRecord[]
  scopeId: string
  onSelectWorkspace: (workspaceId: string) => void
  showPlatform: boolean
  platformWorkspace: WorkspaceRecord | null
}>) {
  return (
    <ScrollView
      style={styles.list}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
    >
      {showAllOption ? (
        <WorkspaceMenuItem
          active={allActive}
          label="All workspaces"
          onPress={onSelectAll}
        />
      ) : null}

      {emptyWithoutQuery ? (
        <Text style={styles.emptyHint}>No workspaces yet.</Text>
      ) : null}

      {hasNoMatches ? (
        <Text style={styles.emptyHint}>
          No workspaces match “{queryLabel}”.
        </Text>
      ) : null}

      {filteredUsers.map((workspace) => (
        <WorkspaceMenuItem
          key={workspace.id}
          active={scopeId === workspace.id}
          label={workspaceName(workspace)}
          onPress={() => onSelectWorkspace(workspace.id)}
        />
      ))}

      {showPlatform && platformWorkspace ? (
        <>
          <View style={styles.menuDivider} />
          <WorkspaceMenuItem
            active={scopeId === platformWorkspace.id}
            label={workspaceName(platformWorkspace)}
            badge
            onPress={() => onSelectWorkspace(platformWorkspace.id)}
          />
        </>
      ) : null}
    </ScrollView>
  )
}

export function WorkspaceSwitcher({
  orgId,
}: Readonly<{
  orgId: string
}>) {
  const router = useRouter()
  const canOwn = useCan('organization', orgId, 'organization:own')
  const { workspaces, scope, isLoading, setScopeId } = useWorkspaceScope()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef<TextInput>(null)

  const users = useMemo(() => userWorkspaces(workspaces), [workspaces])
  const platformWorkspace = useMemo(
    () => findTurbopanelWorkspace(workspaces),
    [workspaces],
  )

  const normalizedQuery = query.trim().toLowerCase()
  const filteredUsers = useMemo(
    () =>
      users.filter((workspace) =>
        matchesWorkspaceQuery(workspace, normalizedQuery),
      ),
    [users, normalizedQuery],
  )

  const showAllOption =
    !normalizedQuery || 'all workspaces'.includes(normalizedQuery)
  const showPlatform =
    platformWorkspace != null &&
    matchesWorkspaceQuery(platformWorkspace, normalizedQuery)
  const emptyWithoutQuery =
    users.length === 0 && !platformWorkspace && !isLoading
  const hasNoMatches =
    !showAllOption &&
    filteredUsers.length === 0 &&
    !showPlatform &&
    !isLoading &&
    Boolean(normalizedQuery)
  let listedWorkspaceCount = users.length
  if (platformWorkspace) {
    listedWorkspaceCount += 1
  }
  const showSearch = listedWorkspaceCount > 6

  useEffect(() => {
    if (!open) {
      return
    }
    const timer = setTimeout(() => {
      searchRef.current?.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [open])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const selectAndClose = (workspaceId: string) => {
    setScopeId(workspaceId)
    close()
  }

  const selectAll = () => {
    setScopeId(ALL_WORKSPACES_SCOPE)
    close()
  }

  const goManage = () => {
    close()
    router.push(manageWorkspacesHref(orgId) as Href)
  }

  const toggleOpen = () => {
    if (open) {
      close()
      return
    }
    setOpen(true)
  }

  const triggerLabel = triggerLabelForScope(scope, isLoading, workspaces.length)

  return (
    <View style={[styles.root, open && styles.rootOpen]}>
      <Pressable
        style={({ pressed }) => [
          styles.trigger,
          pressed && styles.triggerPressed,
          webPointer,
        ]}
        onPress={toggleOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Workspace filter: ${triggerLabel}`}
      >
        <View style={styles.triggerText}>
          <Text style={styles.triggerCaption}>Filter</Text>
          <View style={styles.triggerLabelRow}>
            <Text style={styles.triggerLabel} numberOfLines={1}>
              {triggerLabel}
            </Text>
            {scope.workspace && isTurbopanelWorkspace(scope.workspace) ? (
              <PlatformBadge />
            ) : null}
          </View>
        </View>
        <HeaderChevron color={colors.textMuted} open={open} />
      </Pressable>

      {open && (
        <View style={styles.panel}>
          {showSearch ? (
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search workspaces"
              returnKeyType="search"
            />
          ) : null}

          <WorkspaceResultsList
            showAllOption={showAllOption}
            allActive={scope.id === ALL_WORKSPACES_SCOPE}
            onSelectAll={selectAll}
            emptyWithoutQuery={emptyWithoutQuery}
            hasNoMatches={hasNoMatches}
            queryLabel={query.trim()}
            filteredUsers={filteredUsers}
            scopeId={scope.id}
            onSelectWorkspace={selectAndClose}
            showPlatform={showPlatform}
            platformWorkspace={platformWorkspace}
          />

          <View style={styles.menuDivider} />

          <Pressable
            style={({ pressed }) => [
              styles.menuAction,
              pressed && styles.menuItemPressed,
              webPointer,
            ]}
            onPress={goManage}
          >
            <Text style={styles.menuActionLabel}>Manage workspaces</Text>
          </Pressable>

          {canOwn ? (
            <Pressable
              style={({ pressed }) => [
                styles.menuAction,
                pressed && styles.menuItemPressed,
                webPointer,
              ]}
              onPress={goManage}
            >
              <Text style={styles.menuActionLabel}>Create workspace</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minWidth: 220,
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
  },
  rootOpen: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
    width: '100%',
    maxWidth: 360,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
  },
  triggerPressed: {
    backgroundColor: colors.bgAreaHeader,
  },
  triggerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  triggerCaption: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  triggerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  triggerLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    borderRadius: 6,
    minHeight: 36,
    marginHorizontal: spacing.xs,
    marginTop: spacing.xs,
  },
  list: {
    maxHeight: 240,
  },
  menuItem: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  menuItemActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  menuItemPressed: {
    opacity: 0.85,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  menuItemLabel: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  menuItemLabelActive: {
    color: chrome.accent,
  },
  emptyHint: {
    color: colors.textDim,
    fontSize: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  menuAction: {
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  menuActionLabel: {
    color: colors.textChip,
    fontSize: 12,
    fontWeight: '600',
  },
})
