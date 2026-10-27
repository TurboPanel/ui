import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { Button, ConfirmButton, SectionPanel, StatusDot } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { useCheckForUpdates, usePauseUpdates, useResumeUpdates } from '@/lib/queries/admin'
import {
  CHECK_NOW_HELP,
  checkCadence,
  checkNowRefusal,
  lastCheckedText,
  nextCheckText,
  PAUSE_UPDATES_PROMPT,
  pausedSinceText,
  resumeUpdatesPrompt,
} from '@/lib/update-automation'
import { platformUpgradeHeadlineCopy, type PlatformUpgradeHeadline } from '@/lib/upgrade-display'
import { failedRunMessage } from '@/lib/user-error'
import { colors, layout, spacing } from '@/lib/theme'

function headlineTone(headline: PlatformUpgradeHeadline) {
  switch (headline) {
    case 'up_to_date':
      return 'online' as const
    case 'needs_attention':
      return 'failed' as const
    case 'paused':
      return 'neutral' as const
    default:
      return 'pending' as const
  }
}

/**
 * Check Now: a refresh only (fresh manifests into the status), never a start.
 * A refusal is said in the card; a check too soon after the last one says
 * when to try again and clears once that time has passed. The button stays
 * usable either way.
 */
function useCheckNow() {
  const consoleCommit = useMemo(() => readConsoleBuild()?.commit, [])
  const check = useCheckForUpdates(consoleCommit)
  const [refusal, setRefusal] = useState<ReturnType<typeof checkNowRefusal> | null>(null)
  useEffect(() => {
    if (refusal?.clearAfterMs == null) return undefined
    const timer = setTimeout(() => setRefusal(null), refusal.clearAfterMs)
    return () => clearTimeout(timer)
  }, [refusal])
  const run = async () => {
    setRefusal(null)
    const result = await check.run(undefined)
    if (!result.ok) setRefusal(checkNowRefusal(result.cause ?? new Error(result.error ?? '')))
  }
  return { busy: check.isPending, error: refusal?.text ?? null, run }
}

/**
 * Pause All Updates / Resume Updates. Both refetch the update status on success
 * (`usePauseUpdates` / `useResumeUpdates`); a refusal is said in the card.
 */
function usePauseControl(paused: boolean) {
  const pause = usePauseUpdates()
  const resume = useResumeUpdates()
  const [error, setError] = useState<string | null>(null)
  const toggle = async () => {
    setError(null)
    const result = paused ? await resume.run(undefined) : await pause.run(undefined)
    if (!result.ok) {
      setError(
        failedRunMessage(result, paused ? 'Could not resume updates' : 'Could not pause updates')
      )
    }
  }
  return { busy: pause.isPending || resume.isPending, error, toggle }
}

function StatusControls({
  data,
  check,
  pause,
  narrow,
}: Readonly<{
  data: InstanceUpdates
  check: ReturnType<typeof useCheckNow>
  pause: ReturnType<typeof usePauseControl>
  narrow: boolean
}>) {
  const paused = data.updatesPaused === true
  return (
    <View style={narrow ? styles.controlsNarrow : styles.controls}>
      <Button
        label="Check Now"
        variant="secondary"
        busy={check.busy}
        onPress={() => {
          void check.run()
        }}
      />
      <ConfirmButton
        label={paused ? 'Resume Updates' : 'Pause All Updates'}
        confirmLabel={paused ? 'Yes, Resume' : 'Yes, Pause'}
        dismissLabel="Cancel"
        prompt={paused ? resumeUpdatesPrompt(data.nextCheckAt) : PAUSE_UPDATES_PROMPT}
        variant="secondary"
        busy={pause.busy}
        onConfirm={() => {
          void pause.toggle()
        }}
      />
    </View>
  )
}

/**
 * The Status card of Admin > Updates, on both editions: where updates stand
 * (up to date, waiting, updating, paused), what waits, the last and next
 * check, and the controls: Check Now (a refresh only) and Pause All Updates /
 * Resume Updates. On a wide window the controls sit in the card header; on a
 * phone-width one they move into the card body, under the text, so the
 * confirmation and any message have the card's full width.
 */
export function UpdatesStatusPanel({
  data,
  headline,
  waiting,
  children,
}: Readonly<{
  data: InstanceUpdates
  headline: PlatformUpgradeHeadline
  /** What waits to update, as a sentence, or null. */
  waiting: string | null
  /** Extra facts under the headline (the channel badge on self-hosted). */
  children?: ReactNode
}>) {
  const narrow = useWindowDimensions().width < layout.desktopBreakpoint
  const check = useCheckNow()
  const pause = usePauseControl(data.updatesPaused === true)
  const paused = pausedSinceText(data)
  const nextCheck = data.updatesPaused === true ? null : nextCheckText(data.nextCheckAt)
  const lastChecked = lastCheckedText(data.lastCheckAt)
  const controls = <StatusControls data={data} check={check} pause={pause} narrow={narrow} />
  return (
    <SectionPanel title="Status" headerRight={narrow ? undefined : controls}>
      <View style={styles.text}>
        <View style={styles.headlineRow}>
          <StatusDot tone={headlineTone(headline)} />
          <Text style={styles.headline}>{platformUpgradeHeadlineCopy(headline)}</Text>
        </View>
        {paused ? <Text style={panelStyles.pageCopy}>{paused}</Text> : null}
        {waiting ? <Text style={panelStyles.muted}>{waiting}</Text> : null}
        <Text style={panelStyles.muted}>
          {`Updates install on their own: TurboPanel checks ${checkCadence(data.checkIntervalMinutes)} and updates servers in groups.`}
        </Text>
        {lastChecked ? <Text style={panelStyles.muted}>{lastChecked}</Text> : null}
        {nextCheck ? <Text style={panelStyles.muted}>{nextCheck}</Text> : null}
        <Text style={panelStyles.muted}>{CHECK_NOW_HELP}</Text>
        {children}
        {narrow ? controls : null}
        {check.error ? <Text style={panelStyles.error}>{check.error}</Text> : null}
        {pause.error ? <Text style={panelStyles.error}>{pause.error}</Text> : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  controlsNarrow: {
    width: '100%',
    alignItems: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  headline: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
})
