import { Link } from 'expo-router'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  blockerNamedItems,
  isServerBlockerEnvironmentItem,
  serverBlockerItemName,
  type ServerBlockerItem,
} from '@/lib/server-delete-blockers'
import { projectEnvironmentHref } from '@/lib/project-navigation'
import { moreLabel } from '@/lib/server-delete-preview'
import { colors, spacing, webPointer } from '@/lib/theme'
import { StyleSheet, Text, View, type ViewStyle } from 'react-native'

function environmentHref(
  orgId: string,
  item: ServerBlockerItem
): string | null {
  if (!isServerBlockerEnvironmentItem(item)) return null
  if (!item.projectId || !item.id) return null
  return projectEnvironmentHref(orgId, item.projectId, item.id)
}

function BlockerItemLink({
  orgId,
  item,
}: Readonly<{ orgId: string; item: ServerBlockerItem }>) {
  const label = serverBlockerItemName(item)
  const href = environmentHref(orgId, item)
  if (!href || label.length === 0) {
    return <Text style={panelStyles.muted}>{label}</Text>
  }
  return (
    <Link href={href} style={styles.link as unknown as ViewStyle}>
      {label}
    </Link>
  )
}

/** Lists up to 50 named rows with links where the route is known. */
export function ServerBlockerItemList({
  orgId,
  items,
  more,
}: Readonly<{ orgId: string; items: readonly ServerBlockerItem[]; more: number }>) {
  if (items.length === 0 && more <= 0) return null
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <BlockerItemLink key={item.id} orgId={orgId} item={item} />
      ))}
      {more > 0 ? <Text style={panelStyles.muted}>{moreLabel(more)}</Text> : null}
    </View>
  )
}

export function ServerBlockerItemsFromRow({
  orgId,
  row,
}: Readonly<{ orgId: string; row: Readonly<{ items?: unknown; more?: number }> }>) {
  const { items, more } = blockerNamedItems(row)
  return <ServerBlockerItemList orgId={orgId} items={items} more={more} />
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
    paddingLeft: spacing.sm,
    width: '100%',
  },
  link: {
    color: colors.link,
    fontSize: 14,
    ...webPointer,
  },
})
