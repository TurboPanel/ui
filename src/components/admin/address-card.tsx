import { StyleSheet, Text, View } from 'react-native'
import { colors } from '@/lib/admin-theme'
import type { ServerAddressEntry } from '@/lib/instance-api'

export function AddressCard({ entry }: { entry: ServerAddressEntry }) {
  if (entry.error) {
    return (
      <View style={styles.addressCard}>
        <Text style={styles.addressSource}>{entry.source}</Text>
        <Text style={styles.resultErr}>{entry.error}</Text>
      </View>
    )
  }

  if (!entry.addresses) return null

  return (
    <View style={styles.addressCard}>
      <Text style={styles.addressSource}>{entry.source}</Text>
      <AddressLine label="Private IPv4" values={entry.addresses.privateIpv4} />
      <AddressLine label="Private IPv6" values={entry.addresses.privateIpv6} />
      <AddressLine label="Public IPv4" values={entry.addresses.publicIpv4} />
      <AddressLine label="Public IPv6" values={entry.addresses.publicIpv6} />
    </View>
  )
}

function AddressLine({ label, values }: { label: string; values: string[] }) {
  return (
    <Text style={styles.addressLine}>
      <Text style={styles.addressLabel}>{label}: </Text>
      {values.length > 0 ? values.join(', ') : '—'}
    </Text>
  )
}

const styles = StyleSheet.create({
  addressCard: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.bgInset,
    borderWidth: 1,
    borderColor: colors.borderArea,
  },
  addressSource: {
    color: colors.accent,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
  addressLine: {
    color: colors.stdout,
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  addressLabel: {
    color: colors.textMuted,
  },
  resultErr: {
    color: colors.errorSoft,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
})
