import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, TextField } from '@/components/ui'
import type { InstanceHostnameInput } from '@/lib/instance-api'
import {
  DEFAULT_PANEL_PUBLIC_PORT,
  parsePublicPort,
  publicOriginForRecord,
} from '@/lib/public-url-entry'
import { spacing } from '@/lib/theme'

export function PublicPortCell({
  row,
  busy,
  onChange,
  onValidityChange,
}: Readonly<{
  row: InstanceHostnameInput
  busy: boolean
  onChange: (next: InstanceHostnameInput) => void
  /** Reports whether the typed text is a usable port, so Save can wait for a fix. */
  onValidityChange: (host: string, valid: boolean) => void
}>) {
  const port = row.publicPort ?? DEFAULT_PANEL_PUBLIC_PORT
  const [text, setText] = useState(String(port))
  const typed = parsePublicPort(text)
  // A save or refetch changes the row; show its value, but never overwrite
  // text the operator is still typing.
  useEffect(() => {
    setText((current) => (parsePublicPort(current) === port ? current : String(port)))
  }, [port])
  useEffect(() => {
    const host = row.host
    onValidityChange(host, typed !== null)
    return () => onValidityChange(host, true)
  }, [typed, row.host, onValidityChange])
  return (
    <View style={styles.stack}>
      <TextField
        label="Public Port"
        value={text}
        keyboardType="number-pad"
        editable={!busy}
        error={typed === null ? 'Use a port from 1 to 65535.' : null}
        accessibilityLabel={`Public port for ${row.host}`}
        onChangeText={(value) => {
          setText(value)
          const next = parsePublicPort(value)
          if (next !== null) onChange({ ...row, publicPort: next })
        }}
      />
      <Text style={panelStyles.muted}>
        {publicOriginForRecord({ ...row, publicPort: typed ?? port })}
      </Text>
    </View>
  )
}

export function PrimaryCell({
  primary,
  busy,
  onMakePrimary,
}: Readonly<{ primary: boolean; busy: boolean; onMakePrimary: () => void }>) {
  if (primary) return <Badge label="Primary" tone="ok" />
  return <Button label="Make Primary" size="sm" disabled={busy} onPress={onMakePrimary} />
}

const styles = StyleSheet.create({
  stack: { width: '100%', gap: spacing.xs },
})
