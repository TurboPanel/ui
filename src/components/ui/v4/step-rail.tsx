import { useEffect, useState, type ReactNode } from 'react'
import { Text, View, useWindowDimensions, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
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
  stepCountWords,
  stepRailComplete,
  stepRailFocus,
  stepRailInfo,
  stepRailLabel,
  stepRailSpoken,
  type StepRailInfo,
  type StepRailItem,
  type StepRailState,
} from '@/lib/step-rail'
import type { Palette } from '@/lib/theme-palettes'
import { COMPACT_BREAKPOINT } from '@/lib/v4/ui-scale'

/** A glyph node (a deploy's plan) and a numbered node (a wizard). */
const NODE = 14
const NODE_NUMBERED = 24
/** The spinner ring sits this far outside the node on each side. */
const RING_GAP = 4
const GLYPH = 8
const GLYPH_NUMBERED = 11
const TRACK = 2
/** One soft breath of the running node. */
const PULSE_MS = 900
/** One turn of the spinner ring. */
const SPIN_MS = 1100
/** One pass of the sweep along the running segment. */
const SWEEP_MS = 1800
/** A segment fills in from the left when its step changes state. */
const FILL_MS = 450
/** A node that has just finished settles in with a small overshoot. */
const POP_MS = 320
/** The ring that spreads from the last node when every step has finished. */
const BURST_MS = 760
const TABULAR = { fontVariant: ['tabular-nums'] } as TextStyle

const styles = themedStyles((p) => ({
  root: { gap: 8, width: '100%' },
  track: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  item: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  itemGrow: { flex: 1 },
  connector: { flex: 1, justifyContent: 'center', minWidth: 0, marginHorizontal: 4 },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK,
    borderRadius: 1,
    backgroundColor: p.sep,
  },
  lineFill: { position: 'absolute', left: 0, height: TRACK, borderRadius: 1 },
  sweepClip: { position: 'absolute', left: 0, right: 0, height: TRACK, overflow: 'hidden' },
  sweep: { position: 'absolute', top: 0, height: TRACK, width: '40%', backgroundColor: p.busy },
  nodeWrap: { alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  node: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', pointerEvents: 'none' },
  ring: { position: 'absolute', pointerEvents: 'none' },
  burst: { position: 'absolute', borderWidth: 2, borderColor: p.ok, pointerEvents: 'none' },
  number: { ...typeStyle('monoSemibold', 'caption'), ...TABULAR, color: p.text3 },
  numberActive: { color: p.link },
  numberRunning: { color: p.busy },
  labels: { flexDirection: 'row', width: '100%' },
  labelCell: { flex: 2, minWidth: 0, paddingHorizontal: 4, alignItems: 'center' },
  labelFirst: { flex: 1, paddingLeft: 0, alignItems: 'flex-start' },
  labelLast: { flex: 1, paddingRight: 0, alignItems: 'flex-end' },
  label: { ...typeStyle('body', 'caption'), color: p.text2, flexShrink: 1 },
  labelStrong: { ...typeStyle('bodyMedium', 'caption'), color: p.text, flexShrink: 1 },
  labelMuted: { ...typeStyle('body', 'caption'), color: p.text3, flexShrink: 1 },
  labelBad: { ...typeStyle('bodyMedium', 'caption'), color: p.bad, flexShrink: 1 },
  checklist: { gap: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  checkGlyph: { width: 10, alignItems: 'center' },
  checkWord: { ...typeStyle('body', 'caption'), color: p.text3, marginLeft: 'auto' },
  currentRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, minWidth: 0 },
  currentCount: {
    ...typeStyle('monoSemibold', 'footnote'),
    ...TABULAR,
    color: p.text3,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
}))

type Sheet = ReturnType<typeof styles>

function round(size: number): ViewStyle {
  return { width: size, height: size, borderRadius: size / 2 }
}

/** Fill and border of a node: soft tint for the quiet states, solid for done. */
function nodePaint(p: Palette, state: StepRailState): ViewStyle {
  switch (state) {
    case 'done':
      return { backgroundColor: p.ok, borderColor: p.ok }
    case 'ready':
      return { backgroundColor: p.okSoft, borderColor: p.ok }
    case 'running':
      return { backgroundColor: p.busySoft, borderColor: p.busy }
    case 'active':
      return { backgroundColor: p.accentSoft, borderColor: p.accent }
    case 'failed':
      return { backgroundColor: p.badSoft, borderColor: p.bad }
    case 'skipped':
      return { backgroundColor: p.surface2, borderColor: p.sep }
    default:
      return { backgroundColor: p.surface, borderColor: p.sepStrong }
  }
}

/** The glyph colour: the tone, except on the solid done node where it is the surface. */
function glyphColor(p: Palette, state: StepRailState, info: StepRailInfo): string {
  if (state === 'done') return p.surface
  if (state === 'skipped') return p.text3
  return toneColor(p, info.tone)
}

/** The colour a segment fills with; null leaves the hairline alone. */
function segmentFill(p: Palette, state: StepRailState, reduceMotion: boolean): string | null {
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

function RunningHalo({ color, size }: Readonly<{ color: string; size: number }>) {
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

  return <Animated.View style={[s.halo, round(size), { backgroundColor: color }, haloStyle]} />
}

/**
 * The spinner: a faint full ring with a bright arc that turns around the
 * node. Under reduced motion the arc stays still, so the step still reads as
 * the one in progress without anything moving.
 */
function SpinnerRing({ size, reduceMotion }: Readonly<{ size: number; reduceMotion: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  const turn = useSharedValue(0)
  const ring = size + RING_GAP * 2
  const radius = ring / 2 - 1.5
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(turn)
      turn.value = 0
      return
    }
    turn.value = 0
    turn.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
      false
    )
    return () => {
      cancelAnimation(turn)
    }
  }, [turn, reduceMotion])

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }))

  return (
    <Animated.View
      style={[s.ring, { width: ring, height: ring, top: -RING_GAP, left: -RING_GAP }, spinStyle]}
    >
      <Svg width={ring} height={ring} viewBox={`0 0 ${ring} ${ring}`} aria-hidden>
        <Circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={p.busyLine}
          strokeWidth={1.5}
        />
        <Circle
          cx={ring / 2}
          cy={ring / 2}
          r={radius}
          fill="none"
          stroke={p.busy}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.28} ${circumference}`}
        />
      </Svg>
    </Animated.View>
  )
}

/** One ring that spreads out from the last node and fades: the whole flow has finished. */
function FinishBurst({ size }: Readonly<{ size: number }>) {
  const s = styles(usePalette())
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(1, { duration: BURST_MS, easing: Easing.out(Easing.cubic) })
    return () => {
      cancelAnimation(progress)
    }
  }, [progress])

  const burstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.7, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 2.4]) }],
  }))

  return <Animated.View style={[s.burst, round(size), burstStyle]} />
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
 * in from the left each time the state changes (violet when the step starts,
 * green when it completes); instant under reduced motion.
 */
function SegmentFill({ color, reduceMotion }: Readonly<{ color: string; reduceMotion: boolean }>) {
  const s = styles(usePalette())
  const width = useSharedValue(reduceMotion ? 100 : 0)

  useEffect(() => {
    width.value = reduceMotion
      ? 100
      : withTiming(100, { duration: FILL_MS, easing: Easing.out(Easing.cubic) })
  }, [width, reduceMotion])

  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value}%` }))

  return <Animated.View style={[s.lineFill, { backgroundColor: color }, fillStyle]} />
}

/**
 * A node that has just turned done settles in with a small overshoot. A
 * node drawn done from the start (an old deploy, a page opened late) does
 * not move.
 */
function useJustFinished(state: StepRailState, reduceMotion: boolean): boolean {
  return useBecameTrue(state === 'done') && !reduceMotion
}

/**
 * True from the render where `value` turns true while on screen until it
 * turns false again; never for a value that was true from the start. Kept in
 * state (the previous value beside it), so nothing reads a ref while rendering.
 */
function useBecameTrue(value: boolean): boolean {
  const [previous, setPrevious] = useState(value)
  const [became, setBecame] = useState(false)
  if (previous !== value) {
    setPrevious(value)
    setBecame(value)
  }
  return became
}

function PopIn({ children, size }: Readonly<{ children: ReactNode; size: number }>) {
  const scale = useSharedValue(0.55)

  useEffect(() => {
    scale.value = withTiming(1, { duration: POP_MS, easing: Easing.out(Easing.back(2.2)) })
    return () => {
      cancelAnimation(scale)
    }
  }, [scale])

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return <Animated.View style={[{ width: size, height: size }, popStyle]}>{children}</Animated.View>
}

function NodeMark({
  step,
  number,
  numbered,
}: Readonly<{ step: StepRailItem; number: number | null; numbered: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  const info = stepRailInfo(step.state)
  const showsNumber =
    numbered &&
    number != null &&
    (step.state === 'pending' || step.state === 'active' || step.state === 'running')
  if (showsNumber) {
    return (
      <Text
        style={[
          s.number,
          step.state === 'active' && s.numberActive,
          step.state === 'running' && s.numberRunning,
        ]}
      >
        {number}
      </Text>
    )
  }
  if (!info.glyph) return null
  return (
    <StatusGlyph
      glyph={info.glyph}
      color={glyphColor(p, step.state, info)}
      size={numbered ? GLYPH_NUMBERED : GLYPH}
    />
  )
}

function StepNode({
  step,
  number,
  numbered,
  reduceMotion,
  burst,
}: Readonly<{
  step: StepRailItem
  number: number | null
  numbered: boolean
  reduceMotion: boolean
  burst: boolean
}>) {
  const p = usePalette()
  const s = styles(p)
  const size = numbered ? NODE_NUMBERED : NODE
  const running = step.state === 'running'
  const pop = useJustFinished(step.state, reduceMotion)
  const node = (
    <View style={[s.node, round(size), nodePaint(p, step.state)]}>
      <NodeMark step={step} number={number} numbered={numbered} />
    </View>
  )
  return (
    <View style={[s.nodeWrap, { width: size, height: size }]}>
      {running && !reduceMotion ? <RunningHalo color={p.busy} size={size} /> : null}
      {burst ? <FinishBurst size={size} /> : null}
      {pop ? <PopIn size={size}>{node}</PopIn> : node}
      {running ? <SpinnerRing size={size} reduceMotion={reduceMotion} /> : null}
    </View>
  )
}

/** The stretch of line from a step's node to the next one, painted by that step. */
function Connector({
  state,
  reduceMotion,
}: Readonly<{ state: StepRailState; reduceMotion: boolean }>) {
  const p = usePalette()
  const s = styles(p)
  const fill = segmentFill(p, state, reduceMotion)
  return (
    <View style={[s.connector, { height: TRACK + 10 }]}>
      <View style={s.line} />
      {fill ? <SegmentFill key={state} color={fill} reduceMotion={reduceMotion} /> : null}
      {state === 'running' && !reduceMotion ? <Sweep /> : null}
    </View>
  )
}

function labelStyle(s: Sheet, state: StepRailState): TextStyle {
  switch (state) {
    case 'running':
    case 'active':
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

function labelCellStyle(s: Sheet, index: number, total: number): ViewStyle[] {
  if (index === 0) return [s.labelCell, s.labelFirst]
  if (index === total - 1) return [s.labelCell, s.labelLast]
  return [s.labelCell]
}

function textAlignFor(index: number, total: number): TextStyle {
  if (index === 0 || total === 1) return { textAlign: 'left' }
  if (index === total - 1) return { textAlign: 'right' }
  return { textAlign: 'center' }
}

/**
 * Wide screens: a label under every node. The end cells are half as wide as
 * the others, so each label is centred on its node, the first starts at the
 * left edge and the last ends at the right.
 */
function LabelRow({ steps }: Readonly<{ steps: readonly StepRailItem[] }>) {
  const s = styles(usePalette())
  return (
    <View style={s.labels}>
      {steps.map((step, index) => (
        <View key={step.id} style={labelCellStyle(s, index, steps.length)}>
          <Text
            style={[labelStyle(s, step.state), textAlignFor(index, steps.length)]}
            numberOfLines={2}
          >
            {stepRailLabel(step)}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Phone width: the steps listed under the track, each a glyph, its label and the state word. */
function Checklist({ steps }: Readonly<{ steps: readonly StepRailItem[] }>) {
  const p = usePalette()
  const s = styles(p)
  return (
    <View style={s.checklist}>
      {steps.map((step) => {
        const info = stepRailInfo(step.state)
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
              {step.label}
            </Text>
            <Text style={s.checkWord}>{info.word}</Text>
          </View>
        )
      })}
    </View>
  )
}

/** Phone width, short form: only the step that matters now, with its position. */
function CurrentLine({ steps }: Readonly<{ steps: readonly StepRailItem[] }>) {
  const s = styles(usePalette())
  const focus = stepRailFocus(steps)
  if (!focus) return null
  const complete = stepRailComplete(steps)
  return (
    <View style={s.currentRow}>
      <Text style={s.currentCount}>
        {complete ? 'Done' : stepCountWords(focus.index + 1, steps.length)}
      </Text>
      <Text style={labelStyle(s, focus.step.state)} numberOfLines={1}>
        {stepRailLabel(focus.step)}
      </Text>
    </View>
  )
}

/** True once the rail went from unfinished to finished while on screen. */
function useJustCompleted(complete: boolean, reduceMotion: boolean): boolean {
  return useBecameTrue(complete) && !reduceMotion
}

/**
 * The one step indicator: a node per step joined by a line, the first node
 * on the left edge and the last on the right, however many steps there are.
 *
 * Done fills green and the finished node settles in with a small bounce; a
 * step already in place is dim green; the running one turns a spinner ring
 * around its node with a soft pulse, and its stretch of line fills violet
 * with a slow sweep; a step waiting on the person gets the accent ring; a
 * failed one is red; the rest stay hairline. When the last step finishes, a
 * green ring spreads from the last node once. Reduced motion stops the pulse,
 * the sweep, the turn, the bounce and the burst, and fills lines at once.
 *
 * Labels sit under the nodes on a wide screen. At phone width the rail
 * lists every step as a checklist, or with `phoneLabels="current"` names
 * only the step that matters now. Every node's state is a word in its
 * accessible name, with its position, never colour alone.
 *
 * `numbered` draws bigger nodes with the step number (wizards); without it
 * the nodes are small glyph marks (a deploy's plan).
 */
export function StepRail({
  steps,
  numbered = false,
  phoneLabels = 'checklist',
}: Readonly<{
  steps: readonly StepRailItem[]
  numbered?: boolean
  phoneLabels?: 'checklist' | 'current'
}>) {
  const reduceMotion = useReducedMotion() === true
  const compact = useWindowDimensions().width < COMPACT_BREAKPOINT
  const s = styles(usePalette())
  const complete = stepRailComplete(steps)
  const burst = useJustCompleted(complete, reduceMotion)
  if (steps.length === 0) return null

  let phone = <Checklist steps={steps} />
  if (phoneLabels === 'current') phone = <CurrentLine steps={steps} />

  return (
    <View style={s.root}>
      <View style={s.track} role="list">
        {steps.map((step, index) => {
          const last = index === steps.length - 1
          return (
            <View
              key={step.id}
              style={[s.item, !last && s.itemGrow]}
              role="listitem"
              accessible
              accessibilityLabel={
                step.accessibilityLabel ?? stepRailSpoken(step, index, steps.length)
              }
            >
              <StepNode
                step={step}
                number={step.number === undefined ? index + 1 : step.number}
                numbered={numbered}
                reduceMotion={reduceMotion}
                burst={burst && last}
              />
              {last ? null : <Connector state={step.state} reduceMotion={reduceMotion} />}
            </View>
          )
        })}
      </View>
      {compact ? phone : <LabelRow steps={steps} />}
    </View>
  )
}
