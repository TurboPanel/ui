import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { FingerprintLine } from '@/components/ui'
import { spacing } from '@/lib/theme'

/**
 * The control plane key fingerprints beside an install command, so the person
 * installing can compare them out of band. Renders nothing when the control
 * plane did not send one (an older control plane, or no identity key).
 */
export function PanelKeyLines({
  panelFingerprint,
  nextFingerprint,
}: Readonly<{ panelFingerprint?: string | null; nextFingerprint?: string | null }>) {
  if (!panelFingerprint) return null
  return (
    <View style={styles.root}>
      <FingerprintLine label="Control Plane Key" value={panelFingerprint} />
      {nextFingerprint ? <FingerprintLine label="Next Key" value={nextFingerprint} /> : null}
      <Text style={panelStyles.muted}>
        The server will only trust a control plane that signs with this key. If this fingerprint and
        the one in Admin › Access › Panel Identity differ, do not run the command.
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
})
