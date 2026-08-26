import { useEffect, useMemo, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { LogTranscriptView } from '@/components/org/logs/log-transcript-view'
import { Button, ButtonRow } from '@/components/ui'
import { dockerTimestampTranscriptLines } from '@/lib/execution-log-lines'
import type { ContainerRecord } from '@/lib/instance-api'
import { useContainerLogTail } from '@/lib/queries/containers'
import type { CommandLogState } from '@/lib/queries/execution-logs'
import { spacing } from '@/lib/theme'

const DEFAULT_TAIL = 200

function tailState(input: {
  open: boolean
  follow: boolean
  fetching: boolean
  hasData: boolean
  failed: boolean
}): CommandLogState {
  if (!input.open) return 'idle'
  if (input.failed) return 'unavailable'
  if (input.fetching && !input.hasData) return 'waiting'
  if (input.follow) return 'streaming'
  return input.hasData ? 'sealed' : 'idle'
}

function logsButtonAccessibilityLabel(canTail: boolean, open: boolean): string {
  if (!canTail) {
    return 'Container logs unavailable until Docker identity is reported'
  }
  if (open) return 'Hide container logs'
  return 'Show container logs'
}

/**
 * On-demand `docker container logs` snapshot from a containers-panel row.
 * Follow is a client refetch cadence — the host never `--follow`s.
 */
export function ContainerLogTail({
  orgId,
  container,
}: Readonly<{
  orgId: string
  container: ContainerRecord
}>) {
  const [open, setOpen] = useState(false)
  const [follow, setFollow] = useState(false)
  const dockerId = container.containerId?.trim() ?? ''
  const canTail = dockerId.length > 0

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') setFollow(false)
    })
    return () => subscription.remove()
  }, [])

  const query = useContainerLogTail(orgId, container.id, {
    enabled: open && canTail,
    tail: DEFAULT_TAIL,
    follow,
  })

  const lines = useMemo(
    () => dockerTimestampTranscriptLines(query.data?.logs ?? ''),
    [query.data?.logs],
  )

  const state = tailState({
    open,
    follow,
    fetching: query.isFetching,
    hasData: Boolean(query.data),
    failed: query.isError,
  })

  return (
    <View style={styles.root}>
      <ButtonRow>
        <Button
          label={open ? 'Hide logs' : 'Logs'}
          size="sm"
          disabled={!canTail}
          busy={open && query.isFetching && !follow}
          busyLabel="Loading…"
          onPress={() => {
            if (open) setFollow(false)
            setOpen((current) => !current)
          }}
          accessibilityLabel={logsButtonAccessibilityLabel(canTail, open)}
        />
        {open && canTail ? (
          <Button
            label={follow ? 'Following' : 'Follow'}
            size="sm"
            variant={follow ? 'secondary' : 'ghost'}
            onPress={() => setFollow((current) => !current)}
            accessibilityLabel={
              follow ? 'Stop following container logs' : 'Follow container logs'
            }
          />
        ) : null}
      </ButtonRow>
      {open && canTail ? (
        <LogTranscriptView
          lines={lines}
          state={state}
          title="Container logs"
          hint="Live host tail — discarded when you leave. Never stored."
          downloadFileName={`container-${container.id}.log`}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
})
