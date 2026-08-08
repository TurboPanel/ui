import { useRouter, type Href } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { headerMenuGroupStyles } from '@/components/header-menu-group-styles'
import { ReturnToInstanceIcon } from '@/components/icons/nav-icons'
import { webPointer } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import { colors } from '@/lib/theme'

/**
 * Fills the organization-switcher slot on the admin chrome: leave instance
 * admin and return to the user's preferred org dashboard (or welcome).
 */
export function ReturnToInstanceSegment() {
  const router = useRouter()
  const { resolveDashboardHref } = useAuth()
  const [busy, setBusy] = useState(false)

  const handlePress = () => {
    if (busy) {
      return
    }
    setBusy(true)
    void resolveDashboardHref()
      .then((href) => {
        router.replace(href as Href)
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <View style={styles.triggerWrap}>
      <Pressable
        style={({ pressed }) => [
          headerMenuGroupStyles.trigger,
          pressed && headerMenuGroupStyles.triggerPressed,
          webPointer,
        ]}
        onPress={handlePress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Return to instance"
        accessibilityState={{ busy }}
      >
        <ReturnToInstanceIcon size={15} color={colors.textDim} />
        <View style={headerMenuGroupStyles.triggerCopy}>
          <Text style={headerMenuGroupStyles.triggerLabel} numberOfLines={1}>
            Return to instance
          </Text>
        </View>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  triggerWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
})
