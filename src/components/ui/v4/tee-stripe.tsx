import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet } from 'react-native'
import { RADIUS, TEE_STRIPE } from '@/lib/v4/ui-scale'

const styles = StyleSheet.create({
  stripe: { height: TEE_STRIPE.height, borderRadius: RADIUS.pill, alignSelf: 'stretch' },
})

/**
 * The Tee stripe: a 3 px bar from brand blue to brand green, echoing the logo's
 * crossbar. It appears in exactly two places, the environment header and the
 * Live hero, so it keeps meaning "this is the environment". Both themes use the
 * same two colours.
 */
export function TeeStripe() {
  return (
    <LinearGradient
      colors={[TEE_STRIPE.from, TEE_STRIPE.to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={styles.stripe}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  )
}
