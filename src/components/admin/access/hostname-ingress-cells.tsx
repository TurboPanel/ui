import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, Button, Select, TextField } from '@/components/ui'
import { showsPublicPort, TUNNEL_PUBLIC_PORTS, usesTunnelPorts } from '@/lib/connection-modes'
import type { IngressMode, InstanceHostnameInput } from '@/lib/instance-api'
import {
  DEFAULT_PANEL_PUBLIC_PORT,
  parsePublicPort,
  publicOriginForRecord,
} from '@/lib/public-url-entry'
import { spacing } from '@/lib/theme'

/**
 * The Public Port for a row's connection mode. A self-hosted control plane is
 * always reached on 8443, so the port is read-only text whatever the mode.
 * Otherwise LAN Only is fixed on 8443 and shows no field, a Cloudflare tunnel
 * picks 443 or 8443, and every other mode takes any port.
 */
export function ModePublicPortCell({
  mode,
  selfHosted = false,
  ...props
}: Readonly<{
  mode: IngressMode
  /** True on the self-hosted runtime, where the port is fixed. */
  selfHosted?: boolean
  row: InstanceHostnameInput
  busy: boolean
  onChange: (next: InstanceHostnameInput) => void
  onValidityChange: (host: string, valid: boolean) => void
}>) {
  if (selfHosted) return <FixedPublicPortCell />
  if (!showsPublicPort(mode)) {
    return <Text style={panelStyles.muted}>8443, fixed for LAN Only</Text>
  }
  if (usesTunnelPorts(mode)) {
    return <TunnelPortCell row={props.row} busy={props.busy} onChange={props.onChange} />
  }
  return <PublicPortCell {...props} />
}

export const SELF_HOSTED_PORT_HELP = 'Self-hosted control planes are always reached on port 8443.'

function FixedPublicPortCell() {
  return (
    <View style={styles.stack}>
      <Text>{DEFAULT_PANEL_PUBLIC_PORT}</Text>
      <Text style={panelStyles.muted}>{SELF_HOSTED_PORT_HELP}</Text>
    </View>
  )
}

function TunnelPortCell({
  row,
  busy,
  onChange,
}: Readonly<{
  row: InstanceHostnameInput
  busy: boolean
  onChange: (next: InstanceHostnameInput) => void
}>) {
  const port = row.publicPort ?? DEFAULT_PANEL_PUBLIC_PORT
  return (
    <View style={styles.stack}>
      <Select
        value={String(port)}
        disabled={busy}
        accessibilityLabel={`Public port for ${row.host}`}
        placeholder="Public Port"
        options={TUNNEL_PUBLIC_PORTS.map((value) => ({
          value: String(value),
          label: String(value),
        }))}
        onChange={(value) => {
          const next = Number(value)
          if (next !== port) onChange({ ...row, publicPort: next })
        }}
      />
      <Text style={panelStyles.muted}>{publicOriginForRecord({ ...row, publicPort: port })}</Text>
    </View>
  )
}

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
