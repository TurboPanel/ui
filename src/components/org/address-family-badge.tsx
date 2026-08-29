import { Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'

/** Small "IPv4"/"IPv6" chip; renders nothing when the family is unknown. */
export function AddressFamilyBadge({
  family,
}: Readonly<{ family: 'IPv4' | 'IPv6' | null }>) {
  if (!family) return null
  return (
    <View
      style={panelStyles.segmentChip}
      accessibilityRole="text"
      accessibilityLabel={family}
    >
      <Text style={panelStyles.segmentChipText}>{family}</Text>
    </View>
  )
}
