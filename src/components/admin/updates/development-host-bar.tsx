import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { Button } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { isAdminSession, isSuperadminSession, useAuth } from '@/lib/auth-context'
import {
  DEV_HOST_UPDATED,
  devHostActionError,
  devHostActionsLocked,
  devHostBarVisible,
  devHostDoneHidesInMs,
  devHostFailure,
  devHostJobJustDone,
  devHostJobRunning,
  devHostLines,
  devHostProgressLine,
  devHostWait,
  type DevHostWait,
} from '@/lib/development-host'
import { isDevelopmentInstall } from '@/lib/development-updates'
import type { DevHostAction, DevHostJob } from '@/lib/instance-api'
import {
  useDevelopmentHostAction,
  useDevelopmentUpdates,
  useInstanceUpdates,
} from '@/lib/queries/admin'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { showsUpdateBanner } from '@/lib/update-status'
import { failedRunMessage } from '@/lib/user-error'
import { colors, spacing } from '@/lib/theme'

/** Running, failed or just finished: the line under the parts. */
function JobLine({
  job,
  wait,
  now,
}: Readonly<{ job: DevHostJob | null; wait: DevHostWait; now: number }>) {
  if (!job) return null
  if (devHostJobRunning(job)) {
    return (
      <Text
        style={wait === 'lost' ? styles.failureTitle : styles.progress}
        accessibilityLiveRegion="polite"
      >
        {devHostProgressLine(job, wait)}
      </Text>
    )
  }
  if (job.state === 'failed') {
    const failure = devHostFailure(job)
    return (
      <View style={styles.failure}>
        <Text style={styles.failureTitle}>{failure.title}</Text>
        {failure.detail ? <Text style={panelStyles.muted}>{failure.detail}</Text> : null}
        {failure.logTail.length > 0 ? (
          <View style={styles.log}>
            <Text
              style={panelStyles.detailLine}
              accessibilityLabel="Last lines of output"
              selectable
            >
              {failure.logTail.join('\n')}
            </Text>
          </View>
        ) : null}
      </View>
    )
  }
  if (devHostJobJustDone(job, now)) return <Text style={styles.done}>{DEV_HOST_UPDATED}</Text>
  return null
}

/**
 * The development host bar, under the header of the admin and org shells: on
 * a development install, for a superadmin, while a checkout on this server
 * has new commits on trunk, packages to install, migrations pending, a
 * restart waiting or content changes that keep it from pulling. **Update and
 * Restart** pulls trunk where it is safe, installs, migrates (backup first)
 * and restarts; **Restart Only** restarts. While a job runs the bar shows the
 * step, and "Control plane restarting…" while the control plane is away.
 */
export function DevelopmentHostBar() {
  const { session } = useAuth()
  const status = useInstallStatusQuery()
  const superadmin = isSuperadminSession(session)
  const eligible =
    superadmin &&
    showsUpdateBanner({ isInstanceAdmin: isAdminSession(session), runtime: status.data?.runtime })
  const consoleBuild = useMemo(() => readConsoleBuild(), [])
  const updates = useInstanceUpdates({ enabled: eligible, consoleCommit: consoleBuild?.commit })
  const development = eligible && isDevelopmentInstall(updates.data)
  // The development route is superadmin only; a plain admin never reads it.
  const query = useDevelopmentUpdates({ enabled: development })
  const action = useDevelopmentHostAction()
  const [error, setError] = useState<string | null>(null)
  const data = query.data
  const host = data?.host ?? null
  // Recency is measured at the last good read (rendering stays pure), moved
  // on by a timer when a finished job's minute of "Updated" runs out.
  const [clock, setClock] = useState(0)
  const now = Math.max(clock, query.dataUpdatedAt)
  const doneEndedAt = host?.job?.state === 'done' ? host.job.endedAt : null
  useEffect(() => {
    const hidesIn = devHostDoneHidesInMs({ state: 'done', endedAt: doneEndedAt }, Date.now())
    if (hidesIn === null) return undefined
    const timer = setTimeout(() => {
      setClock(Date.now())
    }, hidesIn + 50)
    return () => {
      clearTimeout(timer)
    }
  }, [doneEndedAt])
  if (!devHostBarVisible({ development, superadmin, host, now }) || !host) return null

  const failingForMs = query.isError ? Math.max(0, query.errorUpdatedAt - query.dataUpdatedAt) : 0
  const wait = devHostWait(data, query.isError || query.failureCount > 0, failingForMs)
  const locked = (devHostActionsLocked(data) && wait !== 'lost') || action.isPending
  const lines = devHostLines(host)
  const run = async (which: DevHostAction) => {
    setError(null)
    const result = await action.run(which)
    if (!result.ok) {
      setError(failedRunMessage(result, 'The action could not start.'))
    } else if (!result.value.ok) {
      setError(devHostActionError(result.value))
    }
  }

  return (
    <View style={styles.root}>
      <View
        style={[styles.bar, host.job?.state === 'failed' && styles.barFailed]}
        accessibilityRole="summary"
        accessibilityLabel="Development host"
      >
        <View style={styles.copy}>
          <Text style={styles.title}>Development Host</Text>
          {lines.map((line) => (
            <Text key={line.name} style={styles.line}>
              {line.text}
            </Text>
          ))}
          <JobLine job={host.job} wait={wait} now={now} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <View style={styles.actions}>
          <Button
            label="Update and Restart"
            variant="primary"
            size="sm"
            disabled={locked}
            onPress={() => {
              void run('update')
            }}
          />
          <Button
            label="Restart Only"
            variant="secondary"
            size="sm"
            disabled={locked}
            onPress={() => {
              void run('restart')
            }}
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    borderLeftColor: colors.busy,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  barFailed: {
    borderLeftColor: colors.error,
  },
  copy: {
    flex: 1,
    minWidth: 240,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  line: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  progress: {
    color: colors.busy,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  done: {
    color: colors.ok,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  failure: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  failureTitle: {
    color: colors.errorText,
    fontSize: 13,
    fontWeight: '600',
  },
  log: {
    padding: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInset,
  },
  error: {
    color: colors.errorText,
    fontSize: 12,
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
})
