import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { TerminalView } from '@/components/terminal/terminal-view'
import { Button, TextField, TextLink } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { Section } from '@/components/ui/v4/section'
import type { ContainerRecord } from '@/lib/instance-api'
import { serverDetailHref } from '@/lib/org-navigation'
import { useContainers } from '@/lib/queries/containers'
import { useCan } from '@/lib/query-client'
import { useServerDetail } from '@/lib/queries/servers'
import { isTerminalDisabledError, terminalErrorMessage } from '@/lib/terminal/errors'
import {
  isValidLoginUser,
  serverPinned,
  terminalEntryAllowed,
  terminalSwitchOn,
} from '@/lib/terminal/gate'

export const LOGIN_USER_ERROR =
  'Login user must be a user name (lowercase letters, digits, _ or -) or a numeric id such as 1000 or 1000:1000.'

/** The running container of the service that a shell can open in. */
export function terminalContainer(containers: readonly ContainerRecord[]): ContainerRecord | null {
  return (
    containers.find(
      (row) =>
        row.role === 'service' && row.status === 'running' && (row.containerId?.trim() ?? '') !== ''
    ) ?? null
  )
}

/**
 * Services › service › Terminal. Shows only where a terminal can work: the
 * server's Container Terminal switch is on, the person may open one, and the
 * server is verified. Nothing opens until the button is pressed.
 */
export function ServiceTerminalPanel({
  orgId,
  serviceId,
}: Readonly<{ orgId: string; serviceId: string }>) {
  const containers = useContainers(orgId, { serviceId })
  const container = useMemo(
    () => terminalContainer(containers.data?.containers ?? []),
    [containers.data?.containers]
  )
  const server = useServerDetail(orgId, container?.serverId ?? '', {
    enabled: container !== null,
  })
  const canOpen = useCan('container', container?.id ?? '', 'terminal:container')
  const canManage = useCan('organization', orgId, 'organization:manage')
  const allowed = terminalEntryAllowed({
    switchOn: terminalSwitchOn(server.data?.options),
    canOpen,
    pinned: serverPinned(server.data?.trustPinnedBy),
    hasContainer: container !== null,
  })
  if (!allowed || !container) return null
  return (
    <Section title="Terminal" collapsible defaultCollapsed>
      <TerminalEntry
        key={container.id}
        orgId={orgId}
        serverId={container.serverId}
        containerId={container.id}
        canManage={canManage}
      />
    </Section>
  )
}

function TerminalEntry({
  orgId,
  serverId,
  containerId,
  canManage,
}: Readonly<{ orgId: string; serverId: string; containerId: string; canManage: boolean }>) {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [run, setRun] = useState<{ n: number; user: string } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [count, setCount] = useState(0)
  const [userError, setUserError] = useState(false)

  if (run) {
    return (
      <TerminalView
        key={run.n}
        serverId={serverId}
        containerId={containerId}
        user={run.user}
        onClose={() => setRun(null)}
        onOpenError={(err) => {
          setError(err)
          setRun(null)
        }}
      />
    )
  }
  return (
    <View style={styles.entry}>
      {error ? (
        <View style={styles.entry}>
          <Text style={panelStyles.error}>{terminalErrorMessage(error)}</Text>
          {canManage && isTerminalDisabledError(error) ? (
            <TextLink
              label="Open server settings"
              onPress={() => router.push(serverDetailHref(orgId, serverId))}
            />
          ) : null}
        </View>
      ) : null}
      <TextField
        label="Login User"
        value={user}
        onChangeText={(value) => {
          setUser(value)
          setUserError(false)
        }}
        autoCapitalize="none"
        autoCorrect={false}
        hint="Leave empty to use the image's user."
        error={userError ? LOGIN_USER_ERROR : undefined}
      />
      <View style={styles.row}>
        <Button
          label="Open Terminal"
          variant="primary"
          onPress={() => {
            const login = user.trim()
            if (login !== '' && !isValidLoginUser(login)) {
              setUserError(true)
              return
            }
            setError(null)
            setCount(count + 1)
            setRun({ n: count + 1, user: login })
          }}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  entry: { gap: 10 },
  row: { flexDirection: 'row' },
})
