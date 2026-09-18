import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { StatusDot, type StatusTone } from '@/components/ui'
import { formatRelativeLocalDateTime } from '@/lib/format-datetime'
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

/** Where a row leads when it names something the console can show. */
export function notificationHref(row: NotificationRecord): string | null {
  if (row.organizationId && row.targetType === 'server' && row.targetId) {
    return `/${row.organizationId}/servers/${row.targetId}`
  }
  if (row.organizationId) return `/${row.organizationId}/overview`
  return null
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

  const go = (href: string) => {
    onNavigate?.()
    router.push(href as never)
  }

  return (
    <View style={styles.body}>
      <View style={styles.headingRow}>
        <Text style={headerMenuGroupStyles.menuHeading}>Notifications</Text>
        {unread > 0 ? (
          <Pressable
            onPress={() => void markRead.run([])}
            accessibilityRole="button"
            accessibilityLabel="Mark all read"
            style={webPointer}
          >
            <Text style={styles.headingAction}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {query.isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyCopy}>Loading…</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No notifications yet</Text>
          <Text style={styles.emptyCopy}>
            Alerts and updates for this account will show up here.
          </Text>
        </View>
      ) : (
        rows.map((row) => {
          const href = notificationHref(row)
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
                onPress={() => {
                  if (row.readAt === null) void markRead.run([row.id])
                  if (href) go(href)
                }}
                accessibilityRole="button"
                accessibilityLabel={row.title}
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
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void dismiss.run(row.id)}
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
      )}

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
        <Text style={headerMenuGroupStyles.menuActionLabel}>Notification settings</Text>
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
