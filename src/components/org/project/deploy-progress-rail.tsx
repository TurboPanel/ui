import { useEffect, useState } from 'react'
import { Text, View, type TextStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { StatusGlyph } from '@/components/ui/v4/status-glyph'
import { StepRail } from '@/components/ui/v4/step-rail'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import {
  elapsedSeconds,
  CHECKING_WITH_SERVER_LABEL,
  CHECKING_WITH_SERVER_TEXT,
  certificateStepNote,
  firstTimeSetupCaption,
  healthStepNote,
  isCheckingWithServer,
  formatElapsed,
  progressCounterText,
  progressSummary,
  stepAccessibilityLabel,
  stepCountText,
  stepTitle,
  stepsOf,
  type ProgressSummary,
} from '@/lib/deploy-progress'
import type { CommandProgress, CommandProgressStep } from '@/lib/instance-api'
import type { StepRailItem, StepRailState } from '@/lib/step-rail'

const RAIL_STATES: ReadonlySet<string> = new Set([
  'pending',
  'running',
  'done',
  'ready',
  'failed',
  'skipped',
])

/**
 * The plan as rail steps: the title-case label, the position the control
 * plane counts (a step already on the server has none) and the spoken name.
 */
function railSteps(steps: readonly CommandProgressStep[]): StepRailItem[] {
  return steps.map((step) => ({
    id: step.id,
    label: stepTitle(step.label),
    state: (RAIL_STATES.has(step.state) ? step.state : 'pending') as StepRailState,
    accessibilityLabel: stepAccessibilityLabel(steps, step),
  }))
}

const GLYPH = 8
/** The caret after the live task line. */
const BLINK_MS = 520
const TABULAR = { fontVariant: ['tabular-nums'] } as TextStyle

const styles = themedStyles((p) => ({
  root: { gap: 10 },
  head: { gap: 4 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  counter: {
    ...typeStyle('monoSemibold', 'footnote'),
    ...TABULAR,
    color: p.text3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  counterLive: { color: p.busy },
  counterBad: { color: p.bad },
  counterOk: { color: p.ok },
  title: { ...typeStyle('bodyMedium', 'subhead'), color: p.text, flexShrink: 1 },
  timer: { ...typeStyle('monoMedium', 'mono'), ...TABULAR, color: p.text2, marginLeft: 'auto' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 0 },
  detail: { ...typeStyle('mono', 'mono'), color: p.text2, flexShrink: 1 },
  caret: { width: 6, height: 12, backgroundColor: p.busy },
  caption: { ...typeStyle('body', 'footnote'), color: p.text3 },
  checking: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: p.busyLine,
    backgroundColor: p.busySoft,
  },
  checkingHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkingTitle: { ...typeStyle('bodyMedium', 'subhead'), color: p.text },
  checkingText: { ...typeStyle('body', 'footnote'), color: p.text2 },
}))

type Sheet = ReturnType<typeof styles>

/** Shown while the control plane is checking with the server: the deploy has not failed. */
function CheckingNotice() {
  const p = usePalette()
  const s = styles(p)
  return (
    <View style={s.checking} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <View style={s.checkingHead}>
        <StatusGlyph glyph="spinner" color={p.busy} size={GLYPH} />
        <Text style={s.checkingTitle}>{CHECKING_WITH_SERVER_LABEL}</Text>
      </View>
      <Text style={s.checkingText}>{CHECKING_WITH_SERVER_TEXT}</Text>
    </View>
  )
}

/** A block caret after the live task line; blinks unless motion is reduced. */
function Caret({ reduceMotion }: Readonly<{ reduceMotion: boolean }>) {
  const s = styles(usePalette())
  const on = useSharedValue(1)

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(on)
      on.value = 1
      return
    }
    on.value = withRepeat(withTiming(0, { duration: BLINK_MS, easing: Easing.steps(1) }), -1, true)
    return () => {
      cancelAnimation(on)
    }
  }, [on, reduceMotion])

  const caretStyle = useAnimatedStyle(() => ({ opacity: on.value }))

  return <Animated.View style={[s.caret, caretStyle]} />
}

function counterSpoken(summary: ProgressSummary): string {
  if (summary.phase === 'waiting') return `Getting Ready, ${summary.total} steps`
  return stepCountText(summary.step, summary.total)
}

function counterStyle(s: Sheet, phase: ProgressSummary['phase']): TextStyle[] {
  if (phase === 'running') return [s.counter, s.counterLive]
  if (phase === 'failed') return [s.counter, s.counterBad]
  if (phase === 'done') return [s.counter, s.counterOk]
  return [s.counter]
}

/**
 * `mm:ss` since the running step started. The clock is seeded when a step
 * starts and ticks once a second only while a step with a start time runs.
 */
function useRunningElapsed(startedAt: string | undefined, running: boolean): string | null {
  const ticking = running && Boolean(startedAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!ticking) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking, startedAt])

  if (!ticking) return null
  const seconds = elapsedSeconds(startedAt, now)
  return seconds == null ? null : formatElapsed(seconds)
}

/**
 * What the server is doing for a deploy, as an instrument: a mono counter and
 * the step name, a timer for the running step, the live task line with a
 * caret, then the shared `StepRail` with a node per step in the daemon's
 * plan (its colours, motion, labels and phone checklist are described there).
 * Reduced motion also stops the caret blink.
 *
 * Nothing is drawn until the control plane has a plan for the command.
 */
export function DeployProgressRail({
  progress,
}: Readonly<{ progress: CommandProgress | null | undefined }>) {
  const p = usePalette()
  const s = styles(p)
  const reduceMotion = useReducedMotion() === true
  const steps = stepsOf(progress)
  const summary = progressSummary(progress)
  const running = summary?.phase === 'running' ? summary.focus : null
  const elapsed = useRunningElapsed(running?.startedAt, running !== null)
  if (!summary) return null

  const caption = firstTimeSetupCaption(steps)
  const certificateNote = certificateStepNote(steps)
  const healthNote = healthStepNote(steps)
  const detail = running?.detail?.trim()

  return (
    <View style={s.root} accessibilityRole="summary" accessibilityLabel="Deploy progress">
      {isCheckingWithServer(progress) ? <CheckingNotice /> : null}
      <View style={s.head}>
        <View style={s.headRow}>
          <Text style={counterStyle(s, summary.phase)} accessibilityLabel={counterSpoken(summary)}>
            {progressCounterText(summary)}
          </Text>
          <Text style={s.title} numberOfLines={2} accessibilityLiveRegion="polite">
            {summary.title}
          </Text>
          {elapsed ? (
            <Text style={s.timer} accessibilityLabel={`${elapsed} on this step`}>
              {elapsed}
            </Text>
          ) : null}
        </View>
        {detail ? (
          <View style={s.detailRow}>
            <Text style={s.detail} numberOfLines={1}>
              {detail}
            </Text>
            <Caret reduceMotion={reduceMotion} />
          </View>
        ) : null}
      </View>
      <StepRail steps={railSteps(steps)} />
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
      {certificateNote ? <Text style={s.caption}>{certificateNote}</Text> : null}
      {healthNote ? <Text style={s.caption}>{healthNote}</Text> : null}
    </View>
  )
}
