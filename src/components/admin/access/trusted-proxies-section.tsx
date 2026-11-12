import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  InlineNotice,
  LoadingState,
  SectionPanel,
  type DataTableColumn,
} from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import { CONNECTION_MODE_LABELS, visitorIpSourceText } from '@/lib/connection-modes'
import type { IngressCapabilities } from '@/lib/instance-api'
import { useInstanceHostnames, useTrustedProxies } from '@/lib/queries/admin'
import { useIngressCapabilities } from '@/lib/queries/ingress'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'cidr', header: 'CIDR', flex: 1, minWidth: 180 },
]

const MODE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'mode', header: 'Connection Mode', flex: 1, minWidth: 160 },
  { key: 'visitorIp', header: 'Visitor Address', flex: 2, minWidth: 240 },
  { key: 'refresh', header: 'Last Refresh', flex: 1, minWidth: 180 },
]

const REPLACEMENT_WARNING =
  'TURBOPANEL_TRUSTED_PROXY_CIDRS replaces the loopback default (127.0.0.0/8, ::1/128). It does not add to that list. If Caddy still runs on this host, include loopback explicitly or the control plane stops believing forwarded client addresses from it.'

export function TrustedProxiesSection() {
  const query = useTrustedProxies()
  if (query.data?.applicable === false) {
    return (
      <View style={styles.root}>
        <Text style={panelStyles.pageTitle}>Trusted Proxies</Text>
        <InlineNotice
          title="Not applicable on this runtime"
          body="TurboPanel High Availability reads the client's real address from Cloudflare's own CF-Connecting-IP header — there is no local proxy in front of it, so this setting has no effect here."
        />
      </View>
    )
  }
  const cidrs = query.data?.cidrs ?? []
  const isDefault = query.data?.isDefault === true
  let loadError: string | null = null
  if (query.isError) {
    loadError = userErrorMessage(query.error, 'Failed to load trusted proxies')
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Trusted Proxies</Text>
      <Text style={panelStyles.pageCopy}>
        Peer addresses whose forwarded client headers this control plane believes. The list is read
        from the process environment at startup.
      </Text>
      <InlineNotice
        tone="warning"
        title="This setting replaces loopback"
        body={REPLACEMENT_WARNING}
      />
      <SectionPanel
        title="Effective CIDRs"
        hint="Read-only. Edit TURBOPANEL_TRUSTED_PROXY_CIDRS and restart the control plane to change it."
        headerRight={
          query.data ? (
            <Badge
              label={isDefault ? 'Loopback default' : 'Custom list'}
              tone={isDefault ? 'muted' : 'pending'}
            />
          ) : null
        }
      >
        {loadError ? <Text style={panelStyles.error}>{loadError}</Text> : null}
        {query.isLoading ? <LoadingState /> : <CidrTable cidrs={cidrs} />}
      </SectionPanel>
      <PerModePanel />
    </View>
  )
}

/** The edge modes the hostnames use, and which header carries the visitor's address for each. */
function PerModePanel() {
  const enabled = useAuth().controlPlaneRuntime !== 'workers'
  const capabilities = useIngressCapabilities({ enabled })
  const hostnames = useInstanceHostnames()
  const used = new Set((hostnames.data?.hostnames ?? []).map((row) => row.mode ?? 'direct'))
  const modes = (capabilities.data?.modes ?? []).filter(
    (capability) => capability.isEdge && used.has(capability.mode)
  )
  if (!enabled) return null
  return (
    <SectionPanel
      title="Per Connection Mode"
      hint="Edge modes trust their own header, whatever the list above says"
    >
      <DataTable columns={MODE_COLUMNS} minWidth={580}>
        {modes.length === 0 ? (
          <DataTableEmpty>No hostname uses an edge connection mode.</DataTableEmpty>
        ) : (
          modes.map((capability, index) => (
            <ModeRow
              key={capability.mode}
              capability={capability}
              alt={index % 2 === 1}
              last={index === modes.length - 1}
            />
          ))
        )}
      </DataTable>
    </SectionPanel>
  )
}

function ModeRow({
  capability,
  alt,
  last,
}: Readonly<{ capability: IngressCapabilities; alt: boolean; last: boolean }>) {
  return (
    <DataTableRow alt={alt} last={last}>
      <DataTableCell column={MODE_COLUMNS[0]}>
        <Text style={styles.text}>{CONNECTION_MODE_LABELS[capability.mode]}</Text>
      </DataTableCell>
      <DataTableCell column={MODE_COLUMNS[1]}>
        <Text style={styles.text}>{visitorIpSourceText(capability)}</Text>
      </DataTableCell>
      <DataTableCell column={MODE_COLUMNS[2]}>
        <Text style={styles.muted}>Managed in a later release</Text>
      </DataTableCell>
    </DataTableRow>
  )
}

function CidrTable({ cidrs }: Readonly<{ cidrs: readonly string[] }>) {
  if (cidrs.length === 0) {
    return (
      <DataTable columns={COLUMNS} minWidth={240}>
        <DataTableEmpty>No trusted proxy CIDRs are configured.</DataTableEmpty>
      </DataTable>
    )
  }
  return (
    <DataTable columns={COLUMNS} minWidth={240}>
      {cidrs.map((cidr, index) => (
        <DataTableRow key={cidr} alt={index % 2 === 1} last={index === cidrs.length - 1}>
          <DataTableCell column={COLUMNS[0]}>
            <Text style={styles.mono}>{cidr}</Text>
          </DataTableCell>
        </DataTableRow>
      ))}
    </DataTable>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  text: { color: colors.text, fontSize: 13 },
  muted: { color: colors.textMuted, fontSize: 12 },
  mono: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
