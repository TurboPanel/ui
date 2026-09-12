import { Text } from 'react-native'
import { MonoText } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { NetworkErrorDescription } from '@/lib/network-error-copy'

/**
 * One error line for the network surfaces. When the instance's collision
 * **409** named the range in the way (`conflictingCidr`), it follows the
 * sentence in monospace so the operator sees *what* collided, not just that
 * something did.
 */
export function NetworkErrorLine({
  error,
}: Readonly<{ error: NetworkErrorDescription | null }>) {
  if (!error) return null
  return (
    <Text style={panelStyles.error} accessibilityRole="alert">
      {error.message}
      {error.conflictingCidr ? (
        <>
          {' '}
          <MonoText selectable>{error.conflictingCidr}</MonoText>
        </>
      ) : null}
    </Text>
  )
}
