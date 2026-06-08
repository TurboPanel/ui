import { forwardRef, useImperativeHandle } from 'react'
import { Text, View } from 'react-native'
import { developerStyles } from '@/components/developer/developer-styles'
import type { ExpoTerminalHandle } from '@/components/developer/expo-terminal-types'

export type { ExpoTerminalHandle } from '@/components/developer/expo-terminal-types'
export { EXPO_TERMINAL_SCROLLBACK } from '@/components/developer/expo-terminal-types'

type ExpoTerminalProps = {
  onData: (data: string) => void
}

const noop = () => {}

export const ExpoTerminal = forwardRef<ExpoTerminalHandle, ExpoTerminalProps>(
  function ExpoTerminal(_props, ref) {
    useImperativeHandle(ref, () => ({
      write: noop,
      reset: noop,
      focus: noop,
      getSize: () => null,
    }))

    return (
      <View style={developerStyles.scrollInset}>
        <Text style={developerStyles.muted}>Interactive terminal requires the web developer console.</Text>
      </View>
    )
  },
)
