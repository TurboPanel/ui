import { useEffect, useState } from 'react'
import { Text, View, type TextStyle, type ViewStyle } from 'react-native'
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
  elapsedSeconds,
  firstTimeSetupCaption,
  formatElapsed,
  progressHeadline,
  runningStep,
  stepNodeInfo,
  type StepNodeInfo,
} from '@/lib/deploy-progress'
import type { CommandProgress, CommandProgressStep } from '@/lib/instance-api'
import type { Palette } from '@/lib/theme-palettes'

const NODE = 18
const GLYPH = 10
/** One soft breath of the running node; well outside the hover/expand dial on purpose. */
const PULSE_MS = 900
/** A connector fills in one expand-row beat. */
const FILL_MS = 200

const styles = themedStyles((p) => ({
  root: { gap: 8 },
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: 8,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
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
  halo: { position: 'absolute', width: NODE, height: NODE, borderRadius: NODE / 2 },
  label: { ...typeStyle('body', 'caption'), color: p.text2, flexShrink: 1 },
  labelStrong: { ...typeStyle('bodyMedium', 'caption'), color: p.text, flexShrink: 1 },
  labelMuted: { ...typeStyle('body', 'caption'), color: p.text3, flexShrink: 1 },
  labelBad: { ...typeStyle('bodyMedium', 'caption'), color: p.bad, flexShrink: 1 },
  track: {
    width: 18,
    height: 1,
    marginHorizontal: 4,
    backgroundColor: p.sep,
    overflow: 'hidden',
  },
  fill: { height: 1, backgroundColor: p.ok },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  headline: { ...typeStyle('bodyMedium', 'subhead'), color: p.text, flexShrink: 1 },
  timer: {
    ...typeStyle('monoMedium', 'mono'),
    color: p.text2,
    marginLeft: 'auto',
    ...({ fontVariant: ['tabular-nums'] } as TextStyle),
  },
  detail: { ...typeStyle('mono', 'mono'), color: p.text2 },
  caption: { ...typeStyle('body', 'footnote'), color: p.text3 },
}))

/** Fill and border of a node, from the palette: soft tint for the quiet states, solid for done. */
function nodePaint(p: Palette, state: string, info: StepNodeInfo): ViewStyle {
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
      return { backgroundColor: p.surface, borderColor: toneColor(p, info.tone) }
  }
}

/** The glyph colour: the tone, except on the solid done node where it is the surface. */
function glyphColor(p: Palette, state: string, info: StepNodeInfo): string {
  if (state === 'done') return p.surface
  if (state === 'skipped') return p.text3
  return toneColor(p, info.tone)
}

function RunningHalo({ color }: Readonly<{ color: string }>) {
  const s = styles(usePalette())
  const progress = useSharedValue(0.35)

  useEffect(() => {
    progress.value = 0.35
    progress.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => {
      cancelAnimation(progress)
    }
  }, [progress])

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 1], [0.45, 0]),
    transform: [{ scale: interpolate(progress.value, [0.35, 1], [1, 1.7]) }],
  }))

  return (
    <Animated.View
      pointerEvents="none"
      style={[s.halo, { backgroundColor: color }, haloStyle]}
    />
  )
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
      <View style={[s.node, nodePaint(p, step.state, info)]}>
        {info.glyph ? (
          <StatusGlyph glyph={info.glyph} color={glyphColor(p, step.state, info)} size={GLYPH} />
        ) : null}
      </View>
    </View>
  )
}

/** The hairline between two nodes; fills in the ok tone once the step before it is ticked. */
function Connector({ filled, reduceMotion }: Readonly<{ filled: boolean; reduceMotion: boolean }>) {
  const s = styles(usePalette())
  const target = filled ? 1 : 0
  const fill = useSharedValue(target)

  useEffect(() => {
    fill.value = reduceMotion ? target : withTiming(target, { duration: FILL_MS })
  }, [fill, reduceMotion, target])

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }))

  return (
    <View style={s.track}>
      <Animated.View style={[s.fill, fillStyle]} />
    </View>
  )
}

function labelStyle(s: ReturnType<typeof styles>, state: string): TextStyle {
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
  if (step.state === 'failed' || step.state === 'skipped') return `${step.label} · ${info.word}`
  return step.label
}

/** `mm:ss` since the running step started; ticks once a second only while running. */
function useRunningElapsed(startedAt: string | undefined, running: boolean): string | null {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running, startedAt])

  if (!running) return null
  const seconds = elapsedSeconds(startedAt, now)
  return seconds == null ? null : formatElapsed(seconds)
}

/**
 * What the server is doing for a deploy, as an instrument: one node per step
 * in the plan the daemon sent, a hairline track that fills as steps are
 * ticked, then the step count, the live task line and a timer for the running
 * step. Reduced motion turns off the pulse and the fill animation; the state
 * of every node is also a word in its accessible name, never colour alone.
 *
 * Nothing is drawn until the control plane has a plan for the command.
 */
export function DeployProgressRail({
  progress,
}: Readonly<{ progress: CommandProgress | null | undefined }>) {
  const p = usePalette()
  const s = styles(p)
  const reduceMotion = useReducedMotion() === true
  const steps = progress?.steps ?? []
  const running = progress ? runningStep(progress) : null
  const elapsed = useRunningElapsed(running?.startedAt, running !== null)
  if (!progress || steps.length === 0) return null

  const headline = progressHeadline(progress)
  const caption = firstTimeSetupCaption(steps)
  const detail = running?.detail?.trim()

  return (
    <View style={s.root} accessibilityRole="summary" accessibilityLabel="Deploy progress">
      <View style={s.rail} accessibilityRole="list">
        {steps.map((step, index) => {
          const info = stepNodeInfo(step.state)
          return (
            <View
              key={step.id}
              style={s.item}
              accessible
              accessibilityLabel={`${step.label}: ${info.word}`}
            >
              <StepNode step={step} info={info} reduceMotion={reduceMotion} />
              <Text style={labelStyle(s, step.state)} numberOfLines={1}>
                {labelText(step, info)}
              </Text>
              {index < steps.length - 1 ? (
                <Connector filled={info.complete} reduceMotion={reduceMotion} />
              ) : null}
            </View>
          )
        })}
      </View>
      {headline ? (
        <View style={s.line}>
          <Text style={s.headline} accessibilityLiveRegion="polite">
            {headline}
          </Text>
          {elapsed ? (
            <Text style={s.timer} accessibilityLabel={`${elapsed} on this step`}>
              {elapsed}
            </Text>
          ) : null}
        </View>
      ) : null}
      {detail ? (
        <Text style={s.detail} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
      {caption ? <Text style={s.caption}>{caption}</Text> : null}
    </View>
  )
}
