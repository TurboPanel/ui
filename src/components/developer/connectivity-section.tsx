import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { useDeveloper } from '@/lib/developer-context'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import { broadcastToDaemon, formatEvent } from '@/lib/instance-api'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'connectivity')!

export function ConnectivitySection() {
  const { healthOk, connections, events, refresh, setError } = useDeveloper()
  const [echo, setEcho] = useState('Hello from UI')
  const [sending, setSending] = useState(false)

  const onBroadcast = async () => {
    setSending(true)
    try {
      await broadcastToDaemon({ text: echo, from: 'ui' })
      await refresh()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Broadcast failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <Text style={developerStyles.inlineLabel}>Broadcast echo</Text>
      <TextInput
        value={echo}
        onChangeText={setEcho}
        style={developerStyles.input}
        placeholderTextColor={colors.textDim}
        placeholder="Message to broadcast"
      />
      <Pressable
        style={[developerStyles.buttonSecondary, sending && developerStyles.buttonDisabled]}
        onPress={() => void onBroadcast()}
        disabled={sending || !healthOk}
      >
        {sending ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={developerStyles.buttonSecondaryText}>Broadcast to all daemons</Text>
        )}
      </Pressable>

      <Text style={developerStyles.inlineLabel}>Activity</Text>
      <ScrollView style={developerStyles.scrollInset} nestedScrollEnabled>
        {events.length === 0 ? (
          <Text style={developerStyles.muted}>Waiting for websocket traffic…</Text>
        ) : (
          [...events].reverse().map((event, index) => (
            <Text key={`${event.at}-${index}`} style={developerStyles.logLine}>
              {formatEvent(event, connections)}
            </Text>
          ))
        )}
      </ScrollView>
    </SectionPanel>
  )
}
