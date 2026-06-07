import { useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput } from 'react-native'
import { SectionPanel } from '@/components/admin/section-panel'
import { adminStyles } from '@/components/admin/admin-styles'
import { useAdmin } from '@/lib/admin-context'
import { ADMIN_SECTIONS } from '@/lib/admin-navigation'
import { broadcastToDaemon, formatEvent } from '@/lib/instance-api'
import { colors } from '@/lib/admin-theme'

const section = ADMIN_SECTIONS.find((s) => s.id === 'connectivity')!

export function ConnectivitySection() {
  const { healthOk, connections, events, refresh, setError } = useAdmin()
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
      <Text style={adminStyles.inlineLabel}>Broadcast echo</Text>
      <TextInput
        value={echo}
        onChangeText={setEcho}
        style={adminStyles.input}
        placeholderTextColor={colors.textDim}
        placeholder="Message to broadcast"
      />
      <Pressable
        style={[adminStyles.buttonSecondary, sending && adminStyles.buttonDisabled]}
        onPress={() => void onBroadcast()}
        disabled={sending || !healthOk}
      >
        {sending ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={adminStyles.buttonSecondaryText}>Broadcast to all daemons</Text>
        )}
      </Pressable>

      <Text style={adminStyles.inlineLabel}>Activity</Text>
      <ScrollView style={adminStyles.scrollInset} nestedScrollEnabled>
        {events.length === 0 ? (
          <Text style={adminStyles.muted}>Waiting for websocket traffic…</Text>
        ) : (
          [...events].reverse().map((event, index) => (
            <Text key={`${event.at}-${index}`} style={adminStyles.logLine}>
              {formatEvent(event, connections)}
            </Text>
          ))
        )}
      </ScrollView>
    </SectionPanel>
  )
}
