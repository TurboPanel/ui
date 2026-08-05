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
  findSystemWorkspace,
  isSystemWorkspace,
  SYSTEM_WORKSPACE_DESCRIPTION,
  userWorkspaces,
} from '@/lib/system-inventory'
import { chrome, colors, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import {
  ALL_WORKSPACES_SCOPE,
  manageWorkspacesHref,
  workspaceDisplayName,
  type WorkspaceScope,
} from '@/lib/workspace-scope'

function matchesWorkspaceQuery(
  workspace: WorkspaceRecord,
  query: string,
): boolean {
  if (!query) {
    return true
  }
  const name = workspaceDisplayName(workspace).toLowerCase()
  const description = workspace.description?.toLowerCase() ?? ''
  return name.includes(query) || description.includes(query)
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
  hint,
  badge,
  onPress,
}: Readonly<{
  active: boolean
  label: string
  hint?: string
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
      <View style={styles.systemTitleRow}>
        <Text
          style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}
        >
          {label}
        </Text>
        {badge ? <PlatformBadge /> : null}
      </View>
      {hint ? (
        <Text style={styles.menuItemHint} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
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
  showSystem,
  systemWorkspace,
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
  showSystem: boolean
  systemWorkspace: WorkspaceRecord | null
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
          hint="Every project in this organization"
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
          label={workspaceDisplayName(workspace)}
          hint={workspace.description ?? undefined}
          onPress={() => onSelectWorkspace(workspace.id)}
        />
      ))}

      {showSystem && systemWorkspace ? (
        <>
          <View style={styles.menuDivider} />
          <WorkspaceMenuItem
            active={scopeId === systemWorkspace.id}
            label={workspaceDisplayName(systemWorkspace)}
            hint={SYSTEM_WORKSPACE_DESCRIPTION}
            badge
            onPress={() => onSelectWorkspace(systemWorkspace.id)}
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
  const systemWorkspace = useMemo(
    () => findSystemWorkspace(workspaces),
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
    users.length > 1 &&
    (!normalizedQuery || 'all workspaces'.includes(normalizedQuery))
  const showSystem =
    systemWorkspace != null &&
    matchesWorkspaceQuery(systemWorkspace, normalizedQuery)
  const emptyWithoutQuery =
    users.length === 0 && !systemWorkspace && !isLoading
  const hasNoMatches =
    !showAllOption &&
    filteredUsers.length === 0 &&
    !showSystem &&
    !isLoading &&
    Boolean(normalizedQuery)

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
        accessibilityLabel={`Workspace: ${triggerLabel}`}
      >
        <View style={styles.triggerText}>
          <Text style={styles.triggerCaption}>Workspace</Text>
          <View style={styles.triggerLabelRow}>
            <Text style={styles.triggerLabel} numberOfLines={1}>
              {triggerLabel}
            </Text>
            {scope.workspace && isSystemWorkspace(scope.workspace) ? (
              <PlatformBadge />
            ) : null}
          </View>
        </View>
        <HeaderChevron color={colors.textMuted} open={open} />
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Search workspaces…"
            placeholderTextColor={colors.textDim}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search workspaces"
            returnKeyType="search"
          />

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
            showSystem={showSystem}
            systemWorkspace={systemWorkspace}
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
                styles.menuActionPrimary,
                pressed && styles.menuItemPressed,
                webPointer,
              ]}
              onPress={goManage}
            >
              <Text style={styles.menuActionPrimaryLabel}>Create workspace</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    overflow: 'hidden',
  },
  rootOpen: {
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgPanel,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 52,
  },
  triggerPressed: {
    backgroundColor: colors.bgAreaHeader,
  },
  triggerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  triggerCaption: {
    color: colors.textDim,
    fontSize: 11,
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
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
  },
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 8,
    minHeight: 44,
  },
  list: {
    maxHeight: 280,
  },
  menuItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  menuItemActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  menuItemPressed: {
    opacity: 0.85,
  },
  menuItemLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemLabelActive: {
    color: chrome.accent,
  },
  menuItemHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
  },
  systemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  emptyHint: {
    color: colors.textDim,
    fontSize: 13,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  menuAction: {
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuActionLabel: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
  },
  menuActionPrimary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  menuActionPrimaryLabel: {
    color: chrome.accent,
    fontSize: 13,
    fontWeight: '700',
  },
})
