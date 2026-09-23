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
import { useTrustedProxies } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'cidr', header: 'CIDR', flex: 1, minWidth: 180 },
]

const REPLACEMENT_WARNING =
  'TURBOPANEL_TRUSTED_PROXY_CIDRS replaces the loopback default (127.0.0.0/8, ::1/128). It does not add to that list. If Caddy still runs on this host, include loopback explicitly or the control plane stops believing forwarded client addresses from it.'

export function TrustedProxiesSection() {
  const query = useTrustedProxies()
  const cidrs = query.data?.cidrs ?? []
  const isDefault = query.data?.isDefault === true
  let loadError: string | null = null
  if (query.isError) {
    loadError =
      query.error instanceof Error
        ? query.error.message
        : 'Failed to load trusted proxies'
  }

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Trusted proxies</Text>
      <Text style={panelStyles.pageCopy}>
        Peer addresses whose forwarded client headers this control plane
        believes. The list is read from the process environment at startup.
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
        {query.isLoading ? (
          <LoadingState />
        ) : (
          <CidrTable cidrs={cidrs} />
        )}
      </SectionPanel>
    </View>
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
        <DataTableRow
          key={cidr}
          alt={index % 2 === 1}
          last={index === cidrs.length - 1}
        >
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
  mono: {
    color: colors.stdout,
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
