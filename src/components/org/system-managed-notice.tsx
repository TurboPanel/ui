import { Pressable, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { PlatformBadge } from '@/components/org/platform-badge'
import { TURBOPANEL_WORKSPACE_DESCRIPTION } from '@/lib/system-inventory'

/**
 * Shared read-only notice for URL-reachable system-managed surfaces.
 * Prefer this over disabled-control clutter.
 */
export function SystemManagedNotice({
  title = 'Platform managed',
  description = TURBOPANEL_WORKSPACE_DESCRIPTION,
  onBack,
  backLabel = 'Back',
}: Readonly<{
  title?: string
  description?: string
  onBack?: () => void
  backLabel?: string
}>) {
  return (
    <View style={orgPanelStyles.statePanel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PlatformBadge />
        <Text style={orgPanelStyles.detailTitle}>{title}</Text>
      </View>
      <Text style={orgPanelStyles.muted}>{description}</Text>
      {onBack ? (
        <Pressable style={orgPanelStyles.toolbarBtnSecondary} onPress={onBack}>
          <Text style={orgPanelStyles.toolbarBtnTextSecondary}>{backLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
