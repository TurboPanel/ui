import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { readConsoleBuild } from '@/components/admin/updates/console-build'
import {
  Button,
  ButtonRow,
  ModalSheet,
  SectionPanel,
  SettingRow,
  StatusDot,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { isSuperadminSession, useAuth } from '@/lib/auth-context'
import type { InstanceUpdates } from '@/lib/instance-api'
import {
  useCheckForUpdates,
  usePauseUpdates,
  useResumeUpdates,
  useUpdateNow,
} from '@/lib/queries/admin'
import {
  checkNowHelp,
  checkNowRefusal,
  lastCheckedText,
  nextCheckText,
  PAUSE_UPDATES_EXPLAINED,
  PAUSE_UPDATES_TITLE,
  pausedSinceText,
  pauseSwitchNote,
  updatesCadenceText,
  updateNowAvailability,
  UPDATE_NOW_UP_TO_DATE,
  updateNowRefusal,
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
 * Update Now: start the update right away (superadmins, release installs).
 * A started run shows through the status and the run view, which the hook
 * reads again; "Already up to date." or a refusal is said in the card.
 */
function useUpdateNowControl(activeRunId: string | null | undefined) {
  const updateNow = useUpdateNow()
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A run that starts (on its own or from another tab) makes "Already up to
  // date." stale: drop it.
  useEffect(() => {
    if (activeRunId) setNote(null)
  }, [activeRunId])
  const run = async () => {
    setNote(null)
    setError(null)
    const result = await updateNow.run(undefined)
    if (!result.ok) {
      setError(updateNowRefusal(result.cause ?? new Error(result.error ?? '')))
    } else if ('upToDate' in result.value) {
      setNote(UPDATE_NOW_UP_TO_DATE)
    }
  }
  return { busy: updateNow.isPending, note, error, run }
}

/**
 * The Pause All Updates switch. Turning it on asks first (`confirming` opens
 * the dialog that says what a pause does and does not do); turning it off
 * resumes at once. Both refetch the update status on success
 * (`usePauseUpdates` / `useResumeUpdates`), and the switch follows that
 * status, so a cancelled dialog leaves it off. A refusal is said in the card.
 */
function usePauseControl() {
  const pause = usePauseUpdates()
  const resume = useResumeUpdates()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const busy = pause.isPending || resume.isPending
  const resuming = useRef(false)
  const resumeNow = async () => {
    // A second tap before the switch shows busy must not send resume twice.
    if (resuming.current || resume.isPending) return
    resuming.current = true
    setError(null)
    try {
      const result = await resume.run(undefined)
      if (!result.ok) setError(failedRunMessage(result, 'Could not resume updates'))
    } finally {
      resuming.current = false
    }
  }
  const confirmPause = async () => {
    setError(null)
    const result = await pause.run(undefined)
    setConfirming(false)
    if (!result.ok) setError(failedRunMessage(result, 'Could not pause updates'))
  }
  /** The switch turned on: ask first, pause nothing yet. */
  const askToPause = () => {
    setError(null)
    setConfirming(true)
  }
  /** The switch turned off: resume at once. */
  const turnOff = () => {
    void resumeNow()
  }
  const cancel = () => {
    if (!pause.isPending) setConfirming(false)
  }
  return {
    busy,
    pausing: pause.isPending,
    error,
    confirming,
    askToPause,
    turnOff,
    confirmPause,
    cancel,
  }
}

/** The dialog shown when Pause All Updates is turned on. */
function PauseConfirmDialog({ pause }: Readonly<{ pause: ReturnType<typeof usePauseControl> }>) {
  return (
    <ModalSheet
      visible={pause.confirming}
      onRequestClose={pause.cancel}
      dismissLabel="Cancel"
      title={PAUSE_UPDATES_TITLE}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" onPress={pause.cancel} disabled={pause.pausing} />
          <Button
            label="Pause Updates"
            busyLabel="Pausing…"
            variant="primary"
            busy={pause.pausing}
            onPress={() => {
              void pause.confirmPause()
            }}
          />
        </ButtonRow>
      }
    >
      {PAUSE_UPDATES_EXPLAINED.map((paragraph) => (
        <Text key={paragraph} style={panelStyles.pageCopy}>
          {paragraph}
        </Text>
      ))}
    </ModalSheet>
  )
}

function StatusControls({
  data,
  check,
  pause,
  updateNow,
}: Readonly<{
  data: InstanceUpdates
  check: ReturnType<typeof useCheckNow>
  pause: ReturnType<typeof usePauseControl>
  /** Null where Update Now is not offered (not a superadmin, or a development install). */
  updateNow: ReturnType<typeof useUpdateNowControl> | null
}>) {
  const paused = data.updatesPaused === true
  const availability = updateNowAvailability(data)
  return (
    <View style={styles.controls}>
      <View style={styles.buttonRow}>
        {updateNow ? (
          <Button
            label="Update Now"
            variant="primary"
            busy={updateNow.busy}
            disabled={!availability.enabled}
            onPress={() => {
              void updateNow.run()
            }}
          />
        ) : null}
        <Button
          label="Check Now"
          variant="secondary"
          busy={check.busy}
          onPress={() => {
            void check.run()
          }}
        />
      </View>
      {updateNow && availability.reason && !updateNow.note ? (
        <Text style={panelStyles.muted}>{availability.reason}</Text>
      ) : null}
      <View style={styles.switchRow}>
        <SettingRow label="Pause All Updates" description={pauseSwitchNote(paused)}>
          <Toggle
            value={paused}
            busy={pause.busy}
            accessibilityLabel="Pause All Updates"
            onValueChange={paused ? pause.turnOff : pause.askToPause}
          />
        </SettingRow>
      </View>
      <PauseConfirmDialog pause={pause} />
    </View>
  )
}

/**
 * The Status card of Admin > Updates, on both editions: where updates stand
 * (up to date, waiting, updating, paused), what waits, the last and next
 * check, and the controls: Update Now (superadmins on a release install:
 * start the update right away; disabled, with the reason under it, unless
 * something waits to install, and while one runs or updates are paused),
 * Check Now (a refresh only) and the Pause All Updates switch, which asks
 * first in a dialog when turned on. The controls sit in the card body under
 * the text at every width, never in the header slot, which does not shrink.
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
  const { session } = useAuth()
  const canUpdateNow = data.development !== true && isSuperadminSession(session)
  const updateNow = useUpdateNowControl(data.activeRunId)
  const isPaused = data.updatesPaused === true
  const pause = usePauseControl()
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
        <Text style={panelStyles.muted}>{checkNowHelp(isPaused, canUpdateNow)}</Text>
        {children}
        <StatusControls
          data={data}
          check={check}
          pause={pause}
          updateNow={canUpdateNow ? updateNow : null}
        />
        {updateNow.note ? <Text style={panelStyles.muted}>{updateNow.note}</Text> : null}
        {updateNow.error ? <Text style={panelStyles.error}>{updateNow.error}</Text> : null}
        {check.error ? <Text style={panelStyles.error}>{check.error}</Text> : null}
        {pause.error ? <Text style={panelStyles.error}>{pause.error}</Text> : null}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
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
  switchRow: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  text: {
    flexShrink: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
})
