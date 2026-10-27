import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ConfirmButton, SectionPanel, StatusDot } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { InstanceUpdates } from '@/lib/instance-api'
import { usePauseUpdates, useResumeUpdates } from '@/lib/queries/admin'
import {
  nextCheckText,
  PAUSE_UPDATES_PROMPT,
  pausedSinceText,
  resumeUpdatesPrompt,
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
 * Pause all updates / Resume. Both refetch the update status on success
 * (`usePauseUpdates` / `useResumeUpdates`); a refusal is said beside the button.
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

function PauseControl({ data }: Readonly<{ data: InstanceUpdates }>) {
  const paused = data.updatesPaused === true
  const control = usePauseControl(paused)
  return (
    <View style={styles.control}>
      <ConfirmButton
        label={paused ? 'Resume updates' : 'Pause all updates'}
        confirmLabel={paused ? 'Yes, resume updates' : 'Yes, pause updates'}
        dismissLabel="No, keep it"
        prompt={paused ? resumeUpdatesPrompt(data.nextCheckAt) : PAUSE_UPDATES_PROMPT}
        variant="secondary"
        busy={control.busy}
        onConfirm={() => {
          void control.toggle()
        }}
      />
      {control.error ? <Text style={panelStyles.error}>{control.error}</Text> : null}
    </View>
  )
}

/**
 * The Status card of Admin > Updates, on both editions: where updates stand
 * (up to date, waiting, updating, paused), what waits, when the next hourly
 * check runs, and the one control, Pause all updates / Resume.
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
  const paused = pausedSinceText(data)
  const nextCheck = data.updatesPaused === true ? null : nextCheckText(data.nextCheckAt)
  return (
    <SectionPanel title="Status" headerRight={<PauseControl data={data} />}>
      <View style={styles.text}>
        <View style={styles.headlineRow}>
          <StatusDot tone={headlineTone(headline)} />
          <Text style={styles.headline}>{platformUpgradeHeadlineCopy(headline)}</Text>
        </View>
        {paused ? <Text style={panelStyles.pageCopy}>{paused}</Text> : null}
        {waiting ? <Text style={panelStyles.muted}>{waiting}</Text> : null}
        <Text style={panelStyles.muted}>
          Updates install on their own: TurboPanel checks once an hour and updates servers in
          groups.
        </Text>
        {nextCheck ? <Text style={panelStyles.muted}>{nextCheck}</Text> : null}
        {children}
      </View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  control: {
    alignItems: 'flex-end',
    gap: spacing.xs,
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
    gap: spacing.xs,
  },
})
