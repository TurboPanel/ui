import { useEffect, useState } from 'react'
import { Text, View, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { toneColor } from '@/components/ui/v4/status-chip'
import { StatusGlyph } from '@/components/ui/v4/status-glyph'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import {
  counterDigits,
  elapsedSeconds,
  CHECKING_WITH_SERVER_LABEL,
  CHECKING_WITH_SERVER_TEXT,
  certificateStepNote,
  firstTimeSetupCaption,
  healthStepNote,
  isCheckingWithServer,
  formatElapsed,
  progressSummary,
  stepAccessibilityLabel,
  stepNodeInfo,
  stepTitle,
  stepsOf,
  type ProgressSummary,
  type StepNodeInfo,
} from '@/lib/deploy-progress'
import type { CommandProgress, CommandProgressStep } from '@/lib/instance-api'
import type { Palette } from '@/lib/theme-palettes'
import { COMPACT_BREAKPOINT } from '@/lib/v4/ui-scale'

const NODE = 14
const GLYPH = 8
const TRACK = 2
/** One soft breath of the running node. */
const PULSE_MS = 900
/** One pass of the sweep along the running segment. */
const SWEEP_MS = 1800
/** A finished segment fills in one expand-row beat. */
const FILL_MS = 200
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
  track: { flexDirection: 'row', alignItems: 'center', height: NODE, width: '100%' },
  segment: { flex: 1, height: NODE, justifyContent: 'center', minWidth: 0 },
  line: { position: 'absolute', left: 0, right: 0, height: TRACK, backgroundColor: p.sep },
  lineFill: { position: 'absolute', left: 0, height: TRACK },
  sweepClip: { position: 'absolute', left: 0, right: 0, height: TRACK, overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, height: TRACK, width: '40%', backgroundColor: p.busy },
  nodeWrap: {
    width: NODE,
    height: NODE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  node: {
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    pointerEvents: 'none',
  },
  endCap: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
    marginLeft: -3,
  },
  endCapDone: { borderColor: p.ok, backgroundColor: p.ok },
  labels: { flexDirection: 'row', width: '100%' },
  labelCell: { flex: 1, minWidth: 0, paddingRight: 8 },
  label: { ...typeStyle('body', 'caption'), color: p.text2, flexShrink: 1 },
  labelStrong: { ...typeStyle('bodyMedium', 'caption'), color: p.text, flexShrink: 1 },
  labelMuted: { ...typeStyle('body', 'caption'), color: p.text3, flexShrink: 1 },
  labelBad: { ...typeStyle('bodyMedium', 'caption'), color: p.bad, flexShrink: 1 },
  checklist: { gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  checkGlyph: { width: 10, alignItems: 'center' },
  checkWord: { ...typeStyle('body', 'caption'), color: p.text3, marginLeft: 'auto' },
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

/** Fill and border of a node: soft tint for the quiet states, solid for done. */
function nodePaint(p: Palette, state: string): ViewStyle {
  switch (state) {
    case 'done':
      return { backgroundColor: p.ok, borderColor: p.ok }
    case 'ready':
      return { backgroundColor: p.okSoft, borderColor: p.ok }
    case 'running':
      return { backgroundColor: p.busySoft, borderColor: p.busy }
    case 'failed':
      return { backgroundColor: p.badSoft, borderColor: p.bad }
    case 'skipped':
      return { backgroundColor: p.surface2, borderColor: p.sep }
    default:
      return { backgroundColor: p.surface, borderColor: p.sepStrong }
  }
}

/** The glyph colour: the tone, except on the solid done node where it is the surface. */
function glyphColor(p: Palette, state: string, info: StepNodeInfo): string {
  if (state === 'done') return p.surface
  if (state === 'skipped') return p.text3
  return toneColor(p, info.tone)
}

/** The colour a segment fills with; null leaves the hairline alone. */
function segmentFill(p: Palette, state: string, reduceMotion: boolean): string | null {
  switch (state) {
    case 'done':
      return p.ok
    case 'ready':
      return p.okLine
    case 'running':
      return reduceMotion ? p.busy : p.busyLine
    case 'failed':
      return p.bad
    default:
      return null
  }
}

function RunningHalo({ color }: Readonly<{ color: string }>) {
  const s = styles(usePalette())
  const progress = useSharedValue(0.35)

  useEffect(() => {
    progress.value = 0.35
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [progress])

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0.45, 0]),
    transform: [{ scale: interpolate(progress.value, [0.35, 1], [1, 1.9]) }],
  }))

  return <Animated.View style={[s.halo, { backgroundColor: color }, haloStyle]} />
}

/** A slow left-to-right sweep along the running segment. */
function Sweep() {
  const s = styles(usePalette())
  const offset = useSharedValue(-40)

  useEffect(() => {
    offset.value = -40
    offset.value = withRepeat(
      withTiming(100, { duration: SWEEP_MS, easing: Easing.linear }),
      -1,
      false
    )
    return () => {
      cancelAnimation(offset)
    }
  }, [offset])

  const sweepStyle = useAnimatedStyle(() => ({ left: `${offset.value}%` }))

  return (
    <View style={s.sweepClip}>
      <Animated.View style={[s.sweep, sweepStyle]} />
    </View>
  )
}

/**
 * The filled part of a segment. It is keyed by the step's state, so it grows
 * in from the left in one beat each time the state changes (violet when the
 * step starts, green again when it completes); instant under reduced motion.
 */
function SegmentFill({ color, reduceMotion }: Readonly<{ color: string; reduceMotion: boolean }>) {
  const s = styles(usePalette())
  const width = useSharedValue(reduceMotion ? 100 : 0)

  useEffect(() => {
    width.value = reduceMotion ? 100 : withTiming(100, { duration: FILL_MS })
  }, [width, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }))

  return <Animated.View style={[s.lineFill, { backgroundColor: color }, fillStyle]} />
}

function StepNode({
  step,
  info,
  reduceMotion,
}: Readonly<{ step: CommandProgressStep; info: StepNodeInfo; reduceMotion: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  const pulse = step.state === 'running' && !reduceMotion
  return (
    <View style={s.nodeWrap}>
      {pulse ? <RunningHalo color={p.busy} /> : null}
      <View style={[s.node, nodePaint(p, step.state)]}>
        {info.glyph ? (
          <StatusGlyph glyph={info.glyph} color={glyphColor(p, step.state, info)} size={GLYPH} />
        ) : null}
      </View>
    </View>
  )
}

/** One step's stretch of the rail: its node at the left boundary, its fill to the next. */
function Segment({
  step,
  steps,
  reduceMotion,
}: Readonly<{
  step: CommandProgressStep
  steps: readonly CommandProgressStep[]
  reduceMotion: boolean
}>) {
  const p = usePalette()
  const s = styles(p)
  const info = stepNodeInfo(step.state)
  const fill = segmentFill(p, step.state, reduceMotion)
  return (
    <View
      style={s.segment}
      role="listitem"
      accessible
      accessibilityLabel={stepAccessibilityLabel(steps, step)}
    >
      <View style={s.line} />
      {fill ? <SegmentFill key={step.state} color={fill} reduceMotion={reduceMotion} /> : null}
      {step.state === 'running' && !reduceMotion ? <Sweep /> : null}
      <StepNode step={step} info={info} reduceMotion={reduceMotion} />
    </View>
  )
}

function labelStyle(s: Sheet, state: string): TextStyle {
  switch (state) {
    case 'running':
      return s.labelStrong
    case 'failed':
      return s.labelBad
    case 'pending':
    case 'skipped':
      return s.labelMuted
    default:
      return s.label
  }
}

/** The label with the state word where the mark alone would leave a question. */
function labelText(step: CommandProgressStep, info: StepNodeInfo): string {
  const title = stepTitle(step.label)
  if (step.state === 'failed' || step.state === 'skipped') return `${title} · ${info.word}`
  return title
}

/** Wide screens: one label under each node, in the node's column. */
function LabelRow({ steps }: Readonly<{ steps: readonly CommandProgressStep[] }>) {
  const s = styles(usePalette())
  return (
    <View style={s.labels}>
      {steps.map((step) => (
        <View key={step.id} style={s.labelCell}>
          <Text style={labelStyle(s, step.state)} numberOfLines={2}>
            {labelText(step, stepNodeInfo(step.state))}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Phone width: the steps listed under the track, each a glyph, its label and the state word. */
function Checklist({ steps }: Readonly<{ steps: readonly CommandProgressStep[] }>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View style={s.checklist}>
      {steps.map((step) => {
        const info = stepNodeInfo(step.state)
        return (
          <View key={step.id} style={s.checkRow}>
            <View style={s.checkGlyph}>
              {info.glyph ? (
                <StatusGlyph
                  glyph={info.glyph}
                  color={glyphColor(p, step.state, info)}
                  size={GLYPH}
                />
              ) : null}
            </View>
            <Text style={labelStyle(s, step.state)} numberOfLines={1}>
              {stepTitle(step.label)}
            </Text>
            <Text style={s.checkWord}>{info.word}</Text>
          </View>
        )
      })}
    </View>
  )
}

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

/** `Step 03 / 07`; before the first step runs the position is a dash, never 00. */
function counterText(summary: ProgressSummary): string {
  const position = summary.phase === 'waiting' ? '--' : counterDigits(summary.step)
  return `Step ${position} / ${counterDigits(summary.total)}`
}

function counterSpoken(summary: ProgressSummary): string {
  if (summary.phase === 'waiting') return `Getting Ready, ${summary.total} steps`
  return `Step ${summary.step} of ${summary.total}`
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
 * caret, then one continuous track with a segment per step in the daemon's
 * plan. Done fills green, a step already on the server dim green, the running
 * one violet with a slow sweep, a failed one red; the rest stay hairline.
 * Labels sit under the nodes on a wide screen and become a checklist on a
 * phone. Reduced motion turns off the pulse, the sweep, the fill and the
 * caret blink. Every node's state is a word in its accessible name, with its
 * position, never colour alone.
 *
 * Nothing is drawn until the control plane has a plan for the command.
 */
export function DeployProgressRail({
  progress,
}: Readonly<{ progress: CommandProgress | null | undefined }>) {
  const p = usePalette()
  const s = styles(p)
  const reduceMotion = useReducedMotion() === true
  const compact = useWindowDimensions().width < COMPACT_BREAKPOINT
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
            {counterText(summary)}
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
      <View style={s.track} role="list">
        {steps.map((step) => (
          <Segment key={step.id} step={step} steps={steps} reduceMotion={reduceMotion} />
        ))}
        <View style={[s.endCap, summary.phase === 'done' && s.endCapDone]} />
      </View>
      {compact ? <Checklist steps={steps} /> : <LabelRow steps={steps} />}
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
      {certificateNote ? <Text style={s.caption}>{certificateNote}</Text> : null}
      {healthNote ? <Text style={s.caption}>{healthNote}</Text> : null}
    </View>
  )
}
