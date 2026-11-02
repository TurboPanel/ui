import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { TextLink } from '@/components/ui'
import { edgeGateLine, reenrollServerHref } from '@/lib/connection-modes'
import type { EdgeGate, EdgeGateWaitingServer } from '@/lib/instance-api'
import { colors, spacing } from '@/lib/theme'

export const REENROLL_HINT =
  'Open each server and use Issue Re-Enroll Token, then run the command on that server.'

/**
 * Whether the edge connection modes (tunnel and proxy) can be used. The control
 * plane decides this by itself: every remote server must have its key pinned.
 * Lists the servers still waiting, each linked to the page with Issue Re-Enroll
 * Token. Shown for the self-hosted runtime only.
 */
export function EdgeGateStatus({ gate }: Readonly<{ gate: EdgeGate | null }>) {
  if (!gate) return null
  const servers = gate.waiting ?? []
  const ready = gate.open && !gate.forcedClosed
  return (
    <View style={styles.root} accessibilityRole="summary">
      <Text style={ready ? styles.ready : styles.waiting}>{edgeGateLine(gate)}</Text>
      {!ready && servers.length > 0 ? (
        <>
          <View style={styles.list}>
            {servers.map((server) => (
              <ServerLink key={server.id} server={server} />
            ))}
          </View>
          <Text style={styles.hint}>{REENROLL_HINT}</Text>
        </>
      ) : null}
    </View>
  )
}

function ServerLink({ server }: Readonly<{ server: EdgeGateWaitingServer }>) {
  const router = useRouter()
  const href = reenrollServerHref(server)
  if (!href) return <Text style={styles.name}>{server.name}</Text>
  return <TextLink label={server.name} size="sm" onPress={() => router.push(href as Href)} />
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  ready: { color: colors.ok, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  waiting: { color: colors.text, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  name: { color: colors.text, fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
})
