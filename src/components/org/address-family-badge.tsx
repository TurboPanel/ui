import { Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'

/** Small "IPv4"/"IPv6" chip; renders nothing when the family is unknown. */
export function AddressFamilyBadge({
  family,
}: Readonly<{ family: 'IPv4' | 'IPv6' | null }>) {
  if (!family) return null
  return (
    <View
      style={orgPanelStyles.segmentChip}
      accessibilityRole="text"
      accessibilityLabel={family}
    >
      <Text style={orgPanelStyles.segmentChipText}>{family}</Text>
    </View>
  )
}
