import { useEffect, useMemo, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { LogViewer } from '@/components/logs/log-viewer'
import { Button } from '@/components/ui/button'
import { panelStyles } from '@/components/ui/panel-styles'
import { SectionPanel } from '@/components/ui/section-panel'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { dockerTimestampTranscriptLines } from '@/lib/execution-log-lines'
import type { ContainerRecord } from '@/lib/instance-api'
import { runtimeLogState } from '@/lib/log-viewer'
import { useContainerLogTail, useContainers } from '@/lib/queries/containers'
import { spacing } from '@/lib/theme'

/** Lines read per request. Runtime output is never stored by TurboPanel. */
const RUNTIME_TAIL_LINES = 200

/** Containers whose output is the app's own (not its ingress), with a Docker id. */
function readableContainers(containers: readonly ContainerRecord[]): ContainerRecord[] {
  return containers.filter(
    (container) => container.role === 'service' && (container.containerId?.trim() ?? '') !== ''
  )
}

function readAt(updatedAt: number): string {
  if (updatedAt === 0) return ''
  const at = new Date(updatedAt)
  return [at.getHours(), at.getMinutes()].map((part) => String(part).padStart(2, '0')).join(':')
}

function RuntimeTail({
  orgId,
  container,
  serviceName,
}: Readonly<{ orgId: string; container: ContainerRecord; serviceName: string }>) {
  const [live, setLive] = useState(false)

  // Live stops when the app goes to the background and does not come back by itself.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') setLive(false)
    })
    return () => subscription.remove()
  }, [])

  const tail = useContainerLogTail(orgId, container.id, {
    enabled: true,
    tail: RUNTIME_TAIL_LINES,
    follow: live,
  })
  const lines = useMemo(
    () => dockerTimestampTranscriptLines(tail.data?.logs ?? ''),
    [tail.data?.logs]
  )
  const at = readAt(tail.dataUpdatedAt)
  const hint = `Last ${RUNTIME_TAIL_LINES} lines from ${serviceName}${at ? `, read at ${at}` : ''}. Not stored. ${
    live ? 'Live: new lines appear as they arrive.' : 'Live is off.'
  }`

  return (
    <View style={styles.tail}>
      {live ? null : (
        <View style={styles.actions}>
          <Button
            label="Read again"
            size="sm"
            busy={tail.isFetching}
            busyLabel="Reading…"
            onPress={() => {
              tail.refetch().catch(() => {
                // The query keeps its own error; the viewer shows it.
              })
            }}
          />
        </View>
      )}
      <LogViewer
        lines={lines}
        state={runtimeLogState({ hasData: Boolean(tail.data), failed: tail.isError, live })}
        grouped={false}
        live={live ? 'on' : 'paused'}
        liveOffLabel="Off"
        onLiveToggle={() => setLive((current) => !current)}
        onScrolledAway={() => setLive(false)}
        hint={hint}
        downloadFileName={`${serviceName}-runtime.log`}
        height={420}
      />
    </View>
  )
}

/**
 * Services › service › Runtime log: what the running app prints, read on
 * demand from the server (last 200 lines, never stored). Nothing is read until
 * the section is opened; Live is off until switched on.
 */
export function ServiceRuntimeLogPanel({
  orgId,
  serviceId,
  serviceName,
}: Readonly<{ orgId: string; serviceId: string; serviceName: string }>) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const containersQuery = useContainers(orgId, { serviceId }, { enabled: open })
  const containers = useMemo(
    () => readableContainers(containersQuery.data?.containers ?? []),
    [containersQuery.data?.containers]
  )
  const container = containers.find((row) => row.id === selectedId) ?? containers[0] ?? null

  let body = null
  if (containersQuery.isLoading) {
    body = <Text style={panelStyles.muted}>Finding the running app…</Text>
  } else if (container) {
    body = (
      <>
        {containers.length > 1 ? (
          <SegmentedControl
            options={containers.map((row) => ({ value: row.id, label: row.containerName }))}
            value={container.id}
            onChange={setSelectedId}
            accessibilityLabel="Container"
          />
        ) : null}
        <RuntimeTail
          key={container.id}
          orgId={orgId}
          container={container}
          serviceName={serviceName}
        />
      </>
    )
  } else {
    body = (
      <Text style={panelStyles.muted}>
        No running container for this service. Its log shows here once it is deployed. An app that
        runs without a container has no runtime log here yet.
      </Text>
    )
  }

  return (
    <SectionPanel
      title="Runtime log"
      hint="What the running app prints. Read from the server when you open it, never stored."
      collapsible
      defaultCollapsed
      onToggle={setOpen}
    >
      {open ? <View style={styles.body}>{body}</View> : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.sm,
  },
  tail: {
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
  },
})
