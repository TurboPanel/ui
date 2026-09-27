import { StyleSheet, Text, View } from 'react-native'
import type { ServerGeo } from '@/lib/instance-api'
import {
  countryCodeToFlagEmoji,
  formatServerGeoAsnLine,
  formatServerGeoPlace,
} from '@/lib/server-geo'
import { colors } from '@/lib/theme'

/**
 * The Location cell shared by the server and datacenter lists: flag +
 * "City, State, Country", and the network ("AS13335 · Cloudflare, Inc.") as a
 * muted second line. Both lines truncate; the accessible label carries the
 * full text. `inline` (tiles, stacked rows) shows the place line only.
 */
export function GeoLocationLines({
  geo,
  inline = false,
}: Readonly<{
  geo: ServerGeo | null | undefined
  inline?: boolean
}>) {
  const flag = countryCodeToFlagEmoji(geo?.country)
  const place = formatServerGeoPlace(geo)
  const network = formatServerGeoAsnLine(geo)

  if (!place && !flag && !network) {
    return <Text style={styles.muted}>—</Text>
  }

  const fullText = [place, network].filter(Boolean).join(' — ')
  return (
    <View style={styles.block} accessible accessibilityLabel={fullText}>
      <View style={styles.row}>
        {flag ? <Text style={styles.flag}>{flag}</Text> : null}
        <Text style={styles.place} numberOfLines={1}>
          {place || '—'}
        </Text>
      </View>
      {network && !inline ? (
        <Text style={styles.network} numberOfLines={1}>
          {network}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    gap: 2,
    maxWidth: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  flag: {
    fontSize: 14,
    lineHeight: 16,
  },
  place: {
    color: colors.textBody,
    fontSize: 12,
    fontWeight: '500',
    flexShrink: 1,
  },
  network: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
  },
  muted: {
    color: colors.textDim,
    fontSize: 12,
  },
})
