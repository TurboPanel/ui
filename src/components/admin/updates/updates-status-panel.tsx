import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import { Button, ConfirmButton, SectionPanel, StatusDot } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { useCheckForUpdates, usePauseUpdates, useResumeUpdates } from '@/lib/queries/admin'
import {
  checkNowHelp,
  checkNowRefusal,
  lastCheckedText,
  nextCheckText,
  PAUSE_UPDATES_PROMPT,
  pausedSinceText,
  resumeUpdatesPrompt,
  updatesCadenceText,
} from '@/lib/update-automation'
import { platformUpgradeHeadlineCopy, type PlatformUpgradeHeadline } from '@/lib/upgrade-display'
import { failedRunMessage } from '@/lib/user-error'
import { colors, spacing } from '@/lib/theme'

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
}: Readonly<{
  data: InstanceUpdates
  check: ReturnType<typeof useCheckNow>
  pause: ReturnType<typeof usePauseControl>
}>) {
  const paused = data.updatesPaused === true
  return (
    <View style={styles.controls}>
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
        stacked
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
 * Resume Updates. The controls sit in the card body under the text at every
 * width, never in the header slot, which does not shrink: the confirmation
 * gets the card's full width with its question on its own line, and resizing
 * the window never moves (and so never closes) an open confirmation.
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
  const check = useCheckNow()
  const isPaused = data.updatesPaused === true
  const pause = usePauseControl(isPaused)
  const paused = pausedSinceText(data)
  const nextCheck = isPaused ? null : nextCheckText(data.nextCheckAt)
  const lastChecked = lastCheckedText(data.lastCheckAt)
  return (
    <SectionPanel title="Status">
      <View style={styles.text}>
        <View style={styles.headlineRow}>
          <StatusDot tone={headlineTone(headline)} />
          <Text style={styles.headline}>{platformUpgradeHeadlineCopy(headline)}</Text>
        </View>
        {paused ? <Text style={panelStyles.pageCopy}>{paused}</Text> : null}
        {waiting ? <Text style={panelStyles.muted}>{waiting}</Text> : null}
        <Text style={panelStyles.muted}>{updatesCadenceText(data)}</Text>
        {lastChecked ? <Text style={panelStyles.muted}>{lastChecked}</Text> : null}
        {nextCheck ? <Text style={panelStyles.muted}>{nextCheck}</Text> : null}
        <Text style={panelStyles.muted}>{checkNowHelp(isPaused)}</Text>
        {children}
        <StatusControls data={data} check={check} pause={pause} />
        {check.error ? <Text style={panelStyles.error}>{check.error}</Text> : null}
        {pause.error ? <Text style={panelStyles.error}>{pause.error}</Text> : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  controls: {
    alignSelf: 'stretch',
    alignItems: 'flex-start',
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
