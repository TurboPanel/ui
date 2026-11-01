import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, TextField } from '@/components/ui'
import type { InstanceHostnameInput } from '@/lib/instance-api'
import {
  DEFAULT_PANEL_PUBLIC_PORT,
  parsePublicPort,
  publicOriginForRecord,
} from '@/lib/public-url-entry'
import { colors, spacing } from '@/lib/theme'

export function PublicPortCell({
  row,
  busy,
  onChange,
}: Readonly<{
  row: InstanceHostnameInput
  busy: boolean
  onChange: (next: InstanceHostnameInput) => void
}>) {
  const port = row.publicPort ?? DEFAULT_PANEL_PUBLIC_PORT
  const [text, setText] = useState(String(port))
  const typed = parsePublicPort(text)
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
      <Text style={styles.muted}>
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
  muted: { color: colors.textMuted, fontSize: 12 },
})
