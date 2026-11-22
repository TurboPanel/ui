import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import type { TerminalViewProps } from '@/components/terminal/terminal-view-types'

export const TERMINAL_NATIVE_COPY = 'The terminal is available on the web.'

/** The phone app has no terminal yet: the web app has it. */
export function TerminalView(_props: TerminalViewProps) {
  return (
    <View style={styles.box}>
      <Text style={panelStyles.muted}>{TERMINAL_NATIVE_COPY}</Text>
    </View>
  )
}

const styles = StyleSheet.create({ box: { paddingVertical: 8 } })
