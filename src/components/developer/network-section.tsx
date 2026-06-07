import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { AddressCard } from '@/components/developer/address-card'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import { ALL_TARGET, DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import {
  daemonLabel,
  fetchAllDaemonAddresses,
  fetchDaemonAddresses,
  fetchInstanceAddresses,
  type ServerAddressEntry,
} from '@/lib/instance-api'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'network')!

export function NetworkSection() {
  const { healthOk, connections, fleet, target, setError } = useDeveloper()
  const [fetchingAddresses, setFetchingAddresses] = useState(false)
  const [addressResults, setAddressResults] = useState<ServerAddressEntry[] | null>(null)

  const canFetchAddresses = !fetchingAddresses && healthOk === true &&
    (target === ALL_TARGET || fleet.some((c) => c.id === target))

  const onFetchAddresses = async () => {
    setFetchingAddresses(true)
    try {
      const results: ServerAddressEntry[] = []

      if (target === ALL_TARGET) {
        const [instance, daemons] = await Promise.all([
          fetchInstanceAddresses(),
          fetchAllDaemonAddresses(),
        ])
        results.push({
          source: instance.source,
          addresses: instance.addresses,
        })
        for (const server of daemons.servers) {
          results.push({
            source: server.hostname?.trim() ||
              daemonLabel(server.daemonId, connections),
            addresses: server.addresses,
            error: server.error,
          })
        }
      } else {
        const response = await fetchDaemonAddresses(target)
        results.push({
          source: response.hostname?.trim() ||
            daemonLabel(target, connections),
          addresses: response.addresses,
        })
      }

      setAddressResults(results)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch addresses')
    } finally {
      setFetchingAddresses(false)
    }
  }

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <Pressable
        style={[developerStyles.buttonSecondary, !canFetchAddresses && developerStyles.buttonDisabled]}
        onPress={() => void onFetchAddresses()}
        disabled={!canFetchAddresses}
      >
        {fetchingAddresses ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={developerStyles.buttonSecondaryText}>Get IP addresses</Text>
        )}
      </Pressable>
      {addressResults ? (
        <View style={developerStyles.addressResults}>
          {addressResults.map((entry) => (
            <AddressCard key={entry.source} entry={entry} />
          ))}
        </View>
      ) : (
        <Text style={developerStyles.muted}>Reads IPs assigned to physical interfaces only</Text>
      )}
    </SectionPanel>
  )
}
