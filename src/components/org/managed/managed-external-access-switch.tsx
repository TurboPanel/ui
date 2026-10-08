import { Text, View } from 'react-native'
import { SettingRow, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { spacing } from '@/lib/theme'

export const EXTERNAL_ACCESS_LABEL = 'Allow external access to the databases on this server'

/** What the switch means, in the words an owner needs. */
export function externalAccessHint(enabled: boolean): string {
  return enabled
    ? "Yes: the database ports are open on all of this server's addresses. The firewall and network rules decide who can reach them."
    : "No: only this server can connect. That means sites run by a site owner's Linux user and containers bound to the database."
}

/** Plain warning shown when the switch also moves other databases. */
export function externalAccessSharedWarning(otherClusters: number): string | null {
  if (otherClusters <= 0) return null
  const others =
    otherClusters === 1
      ? '1 other database on this server shares'
      : `${otherClusters} other databases on this server share`
  return `This is one setting for the whole server: ${others} it, and changing it changes them too.`
}

/**
 * The per-server switch. Controlled; the caller decides when to save
 * (the create form saves with the service, the settings panel on each press).
 */
export function ManagedExternalAccessSwitch({
  serverName,
  value,
  otherClusters,
  pending = false,
  disabled,
  busy = false,
  onChange,
}: Readonly<{
  /** Named when a cluster spans several servers, so each row says which one it moves. */
  serverName?: string
  value: boolean
  otherClusters: number
  pending?: boolean
  disabled: boolean
  busy?: boolean
  onChange: (next: boolean) => void
}>) {
  const warning = externalAccessSharedWarning(otherClusters)
  return (
    <View style={{ gap: spacing.xs }}>
      <SettingRow
        label={serverName ? `${EXTERNAL_ACCESS_LABEL} (${serverName})` : EXTERNAL_ACCESS_LABEL}
        description={externalAccessHint(value)}
      >
        <Toggle
          value={value}
          disabled={disabled}
          busy={busy}
          onLabel="Yes"
          offLabel="No"
          accessibilityLabel={EXTERNAL_ACCESS_LABEL}
          onValueChange={onChange}
        />
      </SettingRow>
      {warning ? <Text style={panelStyles.muted}>{warning}</Text> : null}
      {pending ? (
        <Text style={panelStyles.muted}>
          Waiting for the server to confirm. It may still listen the old way. It is retried
          automatically once the server can take it.
        </Text>
      ) : null}
    </View>
  )
}
