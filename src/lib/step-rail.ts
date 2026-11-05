import type { GlyphKey, StatusTone } from '@/lib/v4/status-vocab'

/**
 * The words and marks behind `StepRail`, the one step indicator the console
 * draws: Add Server, a project deploy, Admin > Updates and the GitHub App
 * wizard all use it. Pure, so the rules are tested without a renderer.
 *
 * `active` is a step waiting on the person (a form they are filling in); it
 * gets the accent ring and its number, never a spinner. `running` is the
 * machine working, which is the only state that spins.
 */
export type StepRailState =
  'pending' | 'active' | 'running' | 'done' | 'ready' | 'failed' | 'skipped'

export type StepRailItem = Readonly<{
  id: string
  label: string
  state: StepRailState
  /** What a screen reader hears for the step; defaults to `stepRailSpoken`. */
  accessibilityLabel?: string
  /** The number drawn in a numbered node; null draws none. Defaults to the position. */
  number?: number | null
}>

export type StepRailInfo = Readonly<{
  /** The state in a word, read beside the label ("Install Docker: done"). */
  word: string
  glyph: GlyphKey | null
  tone: StatusTone
}>

const STEP_INFO: Readonly<Record<StepRailState, StepRailInfo>> = {
  ready: { word: 'already on this server', glyph: 'check', tone: 'ok' },
  done: { word: 'done', glyph: 'check', tone: 'ok' },
  running: { word: 'in progress', glyph: 'spinner', tone: 'busy' },
  active: { word: 'current step', glyph: null, tone: 'idle' },
  pending: { word: 'not started', glyph: null, tone: 'idle' },
  failed: { word: 'failed', glyph: 'diamond', tone: 'bad' },
  skipped: { word: 'skipped', glyph: 'dashed', tone: 'idle' },
}

/** Word, glyph and tone for a step state; an unknown state reads as not started. */
export function stepRailInfo(state: string): StepRailInfo {
  return Object.hasOwn(STEP_INFO, state) ? STEP_INFO[state as StepRailState] : STEP_INFO.pending
}

/** The label with the state word where the mark alone would leave a question. */
export function stepRailLabel(step: Pick<StepRailItem, 'label' | 'state'>): string {
  if (step.state === 'failed' || step.state === 'skipped') {
    return `${step.label} · ${stepRailInfo(step.state).word}`
  }
  return step.label
}

/** "Step 3 of 6, Enroll, in progress". */
export function stepRailSpoken(
  step: Pick<StepRailItem, 'label' | 'state'>,
  index: number,
  total: number
): string {
  return `Step ${index + 1} of ${total}, ${step.label}, ${stepRailInfo(step.state).word}`
}

/** True once every step has ended well: the rail's finished state. */
export function stepRailComplete(steps: readonly Pick<StepRailItem, 'state'>[]): boolean {
  return (
    steps.some((step) => step.state === 'done') &&
    steps.every(
      (step) => step.state === 'done' || step.state === 'ready' || step.state === 'skipped'
    )
  )
}

/**
 * The step a one-line summary is about: the failed one, else the one in
 * progress or waiting on the person, else the first still to run, else the last.
 */
export function stepRailFocus<T extends Pick<StepRailItem, 'state'>>(
  steps: readonly T[]
): { step: T; index: number } | null {
  if (steps.length === 0) return null
  const order: readonly StepRailState[] = ['failed', 'running', 'active', 'pending']
  for (const state of order) {
    const index = steps.findIndex((step) => step.state === state)
    if (index >= 0) return { step: steps[index], index }
  }
  const last = steps.length - 1
  return { step: steps[last], index: last }
}

/**
 * States for a plain wizard: everything before `current` is done, `current`
 * takes `currentState` (waiting on the person by default), the rest are still
 * to come. `current` null leaves every step pending.
 */
export function stepStatesFromCurrent<TId extends string>(
  steps: readonly Readonly<{ id: TId; label: string }>[],
  current: TId | null,
  currentState: StepRailState = 'active'
): StepRailItem[] {
  const activeIndex = current == null ? -1 : steps.findIndex((step) => step.id === current)
  return steps.map((step, index) => {
    let state: StepRailState = 'pending'
    if (activeIndex >= 0 && index < activeIndex) state = 'done'
    else if (index === activeIndex) state = currentState
    return { id: step.id, label: step.label, state }
  })
}
