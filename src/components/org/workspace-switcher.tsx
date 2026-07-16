import { useRouter, type Href } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { useCan } from '@/lib/query-client'
import { colors, layout, spacing } from '@/lib/theme'
import { useWorkspaceScope } from '@/lib/workspace-scope-context'
import {
  ALL_WORKSPACES_SCOPE,
  manageWorkspacesHref,
  newWorkspaceHref,
  workspaceDisplayName,
} from '@/lib/workspace-scope'

export function WorkspaceSwitcher({
  orgId,
}: Readonly<{
  orgId: string
}>) {
  const router = useRouter()
  const { width } = useWindowDimensions()
  const isCompact = width < layout.desktopBreakpoint
  const canOwn = useCan('organization', orgId, 'organization:own')
  const { workspaces, scope, isLoading, setScopeId } = useWorkspaceScope()
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<View>(null)
  const [menuPosition, setMenuPosition] = useState({ top: 56, left: 16 })

  useEffect(() => {
    if (!open || isCompact) {
      return
    }
    buttonRef.current?.measureInWindow((x, y, _w, h) => {
      setMenuPosition({ top: y + h + 6, left: x })
    })
  }, [open, isCompact])

  const close = () => setOpen(false)

  const selectAll = () => {
    setScopeId(ALL_WORKSPACES_SCOPE)
    close()
  }

  const selectWorkspace = (workspaceId: string) => {
    setScopeId(workspaceId)
    close()
  }

  const goManage = () => {
    close()
    router.push(manageWorkspacesHref(orgId) as Href)
  }

  const goCreate = () => {
    close()
    router.push(newWorkspaceHref(orgId) as Href)
  }

  let triggerLabel = scope.label
  if (isLoading && workspaces.length === 0) {
    triggerLabel = 'Loading…'
  }

  const menuBody = (
    <View style={[styles.menu, isCompact && styles.menuSheet]}>
      <Text style={styles.menuHeading}>Switch workspace</Text>

      <Pressable
        style={[
          styles.menuItem,
          scope.id === ALL_WORKSPACES_SCOPE && styles.menuItemActive,
        ]}
        onPress={selectAll}
      >
        <Text
          style={[
            styles.menuItemLabel,
            scope.id === ALL_WORKSPACES_SCOPE && styles.menuItemLabelActive,
          ]}
        >
          All workspaces
        </Text>
        <Text style={styles.menuItemHint}>Every project in this organization</Text>
      </Pressable>

      {workspaces.length === 0 && !isLoading ? (
        <Text style={styles.emptyHint}>No workspaces yet.</Text>
      ) : null}

      {workspaces.map((workspace) => {
        const active = scope.id === workspace.id
        return (
          <Pressable
            key={workspace.id}
            style={[styles.menuItem, active && styles.menuItemActive]}
            onPress={() => selectWorkspace(workspace.id)}
          >
            <Text
              style={[styles.menuItemLabel, active && styles.menuItemLabelActive]}
            >
              {workspaceDisplayName(workspace)}
            </Text>
            {workspace.description ? (
              <Text style={styles.menuItemHint} numberOfLines={2}>
                {workspace.description}
              </Text>
            ) : null}
          </Pressable>
        )
      })}

      <View style={styles.menuDivider} />

      <Pressable style={styles.menuAction} onPress={goManage}>
        <Text style={styles.menuActionLabel}>Manage workspaces</Text>
      </Pressable>

      {canOwn && workspaces.length === 0 ? (
        <Pressable style={styles.menuActionPrimary} onPress={goCreate}>
          <Text style={styles.menuActionPrimaryLabel}>Create workspace</Text>
        </Pressable>
      ) : null}
    </View>
  )

  return (
    <View style={styles.root}>
      <View ref={buttonRef} collapsable={false}>
        <Pressable
          style={styles.trigger}
          onPress={() => setOpen((current) => !current)}
          accessibilityRole="button"
          accessibilityLabel={`Workspace: ${triggerLabel}`}
        >
          <Text style={styles.triggerCaption}>Workspace</Text>
          <Text style={styles.triggerLabel} numberOfLines={1}>
            {triggerLabel}
          </Text>
        </Pressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType={isCompact ? 'slide' : 'fade'}
        onRequestClose={close}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          {isCompact ? (
            <View style={styles.sheetWrap} pointerEvents="box-none">
              {menuBody}
            </View>
          ) : (
            <View
              style={[
                styles.desktopMenuWrap,
                { top: menuPosition.top, left: menuPosition.left },
              ]}
              pointerEvents="box-none"
            >
              {menuBody}
            </View>
          )}
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'flex-start',
    minWidth: 160,
    maxWidth: 280,
  },
  trigger: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  triggerCaption: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  triggerLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-start',
  },
  desktopMenuWrap: {
    position: 'absolute',
    width: 300,
    zIndex: 2,
  },
  sheetWrap: {
    marginTop: 'auto',
    padding: spacing.md,
    zIndex: 2,
  },
  menu: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 10,
    backgroundColor: colors.bgPanel,
    padding: spacing.sm,
    gap: 4,
    maxHeight: 420,
  },
  menuSheet: {
    maxHeight: '70%',
  },
  menuHeading: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  menuItemLabel: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
  },
  menuItemLabelActive: {
    color: colors.accent,
  },
  menuItemHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 16,
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
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: 2,
  },
  menuActionPrimaryLabel: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
})
