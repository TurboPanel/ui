import { StyleSheet, Text, View } from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  formatServerGeoCountryCode,
  formatServerGeoLocation,
} from '@/lib/server-geo'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

// Docker/veth/bridge interfaces are filtered daemon-side before addresses reach the API.

function dialLine(server: ServerDetailRecord): string {
  const raw = server.remoteAddress?.trim()
  if (!raw || raw === '__direct__') {
    return 'Co-located (Unix socket)'
  }
  return raw
}

function AddressGroup({
  label,
  addresses,
}: Readonly<{ label: string; addresses: string[] }>) {
  if (addresses.length === 0) return null
  return (
    <View style={styles.group}>
      <Text style={orgPanelStyles.detailTitle}>{label}</Text>
      {addresses.map((addr) => (
        <Text key={addr} style={styles.mono} selectable>
          {addr}
        </Text>
      ))}
    </View>
  )
}

export function ServerNetworkSection({
  server,
}: Readonly<{ server: ServerDetailRecord }>) {
  const addresses = server.addresses
  const hasLists =
    addresses != null &&
    (addresses.publicIpv4.length > 0 ||
      addresses.publicIpv6.length > 0 ||
      addresses.privateIpv4.length > 0 ||
      addresses.privateIpv6.length > 0)

  const geoLocation = formatServerGeoLocation(server.geo)
  const geoCountry = formatServerGeoCountryCode(server.geo)
  const geoLine = [geoLocation, geoCountry].filter(Boolean).join(', ')

  return (
    <View style={styles.root}>
      <SectionPanel title="Interfaces" hint="Non-container addresses from the daemon">
        {!hasLists ? (
          <Text style={orgPanelStyles.muted}>
            No interface addresses reported yet.
          </Text>
        ) : (
          <>
            <AddressGroup label="Public IPv4" addresses={addresses!.publicIpv4} />
            <AddressGroup label="Public IPv6" addresses={addresses!.publicIpv6} />
            <AddressGroup label="Private IPv4" addresses={addresses!.privateIpv4} />
            <AddressGroup label="Private IPv6" addresses={addresses!.privateIpv6} />
          </>
        )}
      </SectionPanel>

      <SectionPanel title="Control-plane connection" hint="How this host dials the instance">
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Dial: </Text>
          <Text style={styles.mono}>{dialLine(server)}</Text>
        </Text>
        {geoLine ? (
          <Text style={orgPanelStyles.detailLine}>
            <Text style={orgPanelStyles.detailLabel}>Geo: </Text>
            {geoLine}
          </Text>
        ) : null}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  group: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
})
