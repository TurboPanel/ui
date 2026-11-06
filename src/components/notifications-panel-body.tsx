import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { StatusDot, TextLink, type StatusTone } from '@/components/ui'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
import { unreadBadgeLabel } from '@/lib/notification-preferences'
import { getActiveOrganizationId } from '@/lib/org-context'
import { useNotificationPreferencesQuery } from '@/lib/queries/notification-preferences'
import type { NotificationRecord, NotificationSeverity } from '@/lib/instance-api'
import {
  useDismissNotification,
  useMarkNotificationsRead,
  useNotificationsQuery,
} from '@/lib/queries/notifications'
import { colors, spacing, webPointer } from '@/lib/theme'

const SEVERITY_TONE: Record<NotificationSeverity, StatusTone> = {
  info: 'online',
  warning: 'pending',
  critical: 'offline',
}

/**
 * Where a row leads when it names something the web interface can show. A row
 * whose server, project or backup target was deleted leads nowhere: no dead
 * link.
 */
export function notificationHref(row: NotificationRecord): string | null {
  if (row.targetDeleted === true) return null
  if (row.organizationId && row.targetType === 'server' && row.targetId) {
    return `/${row.organizationId}/servers/${row.targetId}`
  }
  if (row.organizationId) return `/${row.organizationId}/overview`
  return null
}

/** The empty bell's words: nothing yet, or nothing turned on at all. */
export function emptyInboxCopy(nothingOn: boolean): { title: string; body: string } {
  if (nothingOn) {
    return {
      title: 'Nothing is turned on',
      body: 'You will not hear anything here until you choose what to hear in your notification settings.',
    }
  }
  return {
    title: 'No notifications yet',
    body: 'Alerts and updates for this account will show up here.',
  }
}

function NotificationInboxRows({
  isLoading,
  nothingOn,
  rows,
  onOpen,
  onDismiss,
  onOpenSettings,
}: Readonly<{
  isLoading: boolean
  nothingOn: boolean
  rows: readonly NotificationRecord[]
  onOpen: (row: NotificationRecord) => void
  onDismiss: (id: string) => void
  onOpenSettings: () => void
}>) {
  if (isLoading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyCopy}>Loading…</Text>
      </View>
    )
  }
  if (rows.length === 0) {
    const copy = emptyInboxCopy(nothingOn)
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{copy.title}</Text>
        <Text style={styles.emptyCopy}>{copy.body}</Text>
        {nothingOn ? (
          <TextLink label="Turn On Notifications" size="sm" onPress={onOpenSettings} />
        ) : null}
      </View>
    )
  }
  return rows.map((row) => {
    // Two siblings, not a button inside a button: the row opens the
    // target, the × beside it dismisses.
    return (
      <View
        key={row.id}
        style={[styles.row, row.readAt === null && styles.rowUnread]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.rowMain,
            pressed && headerMenuGroupStyles.itemPressed,
            webPointer,
          ]}
          onPress={() => onOpen(row)}
          accessibilityRole={notificationHref(row) ? 'link' : 'button'}
          accessibilityLabel={row.targetDeleted ? `${row.title}, deleted` : row.title}
        >
          <View style={styles.rowDot}>
            <StatusDot tone={SEVERITY_TONE[row.severity]} />
          </View>
          <View style={styles.rowText}>
            <Text
              style={[styles.rowTitle, row.readAt === null && styles.rowTitleUnread]}
              numberOfLines={2}
            >
              {row.title}
            </Text>
            {row.body ? (
              <Text style={styles.rowBody} numberOfLines={2}>
                {row.body}
              </Text>
            ) : null}
            <Text style={styles.rowMeta}>
              {formatRelativeLocalDateTime(row.createdAt)}
              {row.targetDeleted ? ' · This item was deleted' : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={() => onDismiss(row.id)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          hitSlop={8}
          style={[styles.dismissWrap, webPointer]}
        >
          <Text style={styles.dismiss}>×</Text>
        </Pressable>
      </View>
    )
  })
}

/**
 * The bell's list: the newest inbox rows for the signed-in person, unread
 * first by weight of the dot, with **Mark all read** and a link to the
 * preferences screen. Shared by the web header bell and the native account
 * sheet. Rows come from `GET /notifications`; a row that names a server
 * opens that server.
 */
export function NotificationsPanelBody({
  onNavigate,
}: Readonly<{ onNavigate?: () => void }> = {}) {
  const router = useRouter()
  const query = useNotificationsQuery({ limit: 20 })
  const markRead = useMarkNotificationsRead()
  const dismiss = useDismissNotification()
  const rows = query.data?.notifications ?? []
  const unread = query.data?.unread ?? 0
  // An empty bell asks whether anything is turned on at all (nothing is by
  // default), for the organization in view plus the person's global rows.
  const preferences = useNotificationPreferencesQuery(getActiveOrganizationId(), {
    enabled: query.isSuccess && rows.length === 0,
  })
  const nothingOn = preferences.data?.effective.inbox.level === 'none'

  const go = (href: string) => {
    onNavigate?.()
    router.push(href as never)
  }

  return (
    <View style={styles.body}>
      <View style={styles.headingRow}>
        <Text style={headerMenuGroupStyles.menuHeading}>
          {unread > 0 ? `Notifications · ${unreadBadgeLabel(unread)} unread` : 'Notifications'}
        </Text>
        {unread > 0 ? (
          <Pressable
            onPress={() => void markRead.run([])}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            style={webPointer}
          >
            <Text style={styles.headingAction}>Mark All Read</Text>
          </Pressable>
        ) : null}
      </View>

      <NotificationInboxRows
        isLoading={query.isLoading}
        nothingOn={nothingOn}
        rows={rows}
        onOpenSettings={() => go('/account/notifications')}
        onOpen={(row) => {
          if (row.readAt === null) void markRead.run([row.id])
          const href = notificationHref(row)
          if (href) go(href)
        }}
        onDismiss={(id) => {
          void dismiss.run(id)
        }}
      />

      <View style={headerMenuGroupStyles.menuDivider} />
      <Pressable
        style={({ pressed }) => [
          headerMenuGroupStyles.menuAction,
          pressed && headerMenuGroupStyles.itemPressed,
          webPointer,
        ]}
        onPress={() => go('/account/notifications')}
        accessibilityRole="menuitem"
        accessibilityLabel="Notification settings"
      >
        <Text style={headerMenuGroupStyles.menuActionLabel}>Notification Settings</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: 2,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: spacing.sm,
  },
  headingAction: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    gap: 4,
  },
  emptyTitle: {
    color: colors.textBody,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  emptyCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: 8,
  },
  dismissWrap: {
    paddingTop: 6,
    paddingRight: spacing.sm,
  },
  rowUnread: {
    backgroundColor: colors.bgSecondary,
  },
  rowDot: {
    paddingTop: 5,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.textBody,
    fontSize: 13,
    lineHeight: 18,
  },
  rowTitleUnread: {
    fontWeight: '600',
  },
  rowBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  rowMeta: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 14,
  },
  dismiss: {
    color: colors.textDim,
    fontSize: 16,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
})
