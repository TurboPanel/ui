import type { CommandProgressStep, CommandProgressStepState } from '@/lib/instance-api'
import type { GlyphKey, StatusTone } from '@/lib/v4/status-vocab'

/**
 * Words and numbers derived from a deploy's step plan (`CommandProgress`),
 * shared by the progress rail, the environment status line and the activity
 * table so every surface counts the same way the control plane does:
 * the total is every step that is not `ready`, the position is the steps
 * `done` plus one while a step is `running`.
 *
 * The payload comes off the wire, so every reader tolerates a missing or
 * malformed `steps` list rather than taking the Overview down with it.
 */

type ProgressLike = Readonly<{
  steps?: unknown
  current?: string | null
}>

/** The steps of a payload as a list; an absent or malformed list reads as empty. */
export function stepsOf(progress: ProgressLike | null | undefined): CommandProgressStep[] {
  const steps = progress?.steps
  if (!Array.isArray(steps)) return []
  return steps.filter(
    (step): step is CommandProgressStep =>
      typeof step === 'object' && step !== null && typeof (step as CommandProgressStep).id === 'string',
  )
}

/** Steps that count towards "Step N of M": everything the server has to do. */
export function countedSteps(steps: readonly CommandProgressStep[] | null | undefined): CommandProgressStep[] {
  return stepsOf({ steps }).filter((step) => step.state !== 'ready')
}

/**
 * The running step: the one `current` names when it is in fact running, else
 * the first step in the `running` state, else null.
 */
export function runningStep(progress: ProgressLike | null | undefined): CommandProgressStep | null {
  const steps = stepsOf(progress)
  const current = progress?.current
  if (current) {
    const named = steps.find((step) => step.id === current)
    if (named?.state === 'running') return named
  }
  return steps.find((step) => step.state === 'running') ?? null
}

/** The step the deploy failed on, or null. */
export function failedStep(steps: readonly CommandProgressStep[] | null | undefined): CommandProgressStep | null {
  return stepsOf({ steps }).find((step) => step.state === 'failed') ?? null
}

/** One-based position of a step among the counted ones; 0 when it is `ready`. */
export function stepPosition(
  steps: readonly CommandProgressStep[] | null | undefined,
  step: CommandProgressStep,
): number {
  return countedSteps(steps).indexOf(step) + 1
}

const GERUNDS: Readonly<Record<string, string>> = {
  Install: 'Installing',
  Fetch: 'Fetching',
  Build: 'Building',
  Start: 'Starting',
  Check: 'Checking',
  Set: 'Setting',
  Pull: 'Pulling',
  Run: 'Running',
  Stop: 'Stopping',
  Restart: 'Restarting',
}

/**
 * The label as something happening now: "Install Docker" reads "Installing
 * Docker", "Set up certificates" reads "Setting up certificates". A label
 * whose first word is not a known verb is returned unchanged.
 */
export function gerundLabel(label: string): string {
  const trimmed = label.trim()
  const space = trimmed.indexOf(' ')
  const first = space === -1 ? trimmed : trimmed.slice(0, space)
  const gerund = GERUNDS[first]
  if (!gerund) return trimmed
  return space === -1 ? gerund : `${gerund}${trimmed.slice(space)}`
}

/** "Step 3 of 7 · Installing Docker"; the label is optional. */
export function stepCountText(step: number, totalSteps: number, label?: string | null): string {
  const count = `Step ${step} of ${totalSteps}`
  return label ? `${count} · ${label}` : count
}

/** `01:42`; minutes keep counting past an hour ("72:05"). */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Whole seconds since `startedAt`, never negative; null when the time is missing or unreadable. */
export function elapsedSeconds(startedAt: string | null | undefined, now: number): number | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.floor((now - started) / 1000))
}

/**
 * How long the whole plan took, from the first step that started to the last
 * that finished; null until both times are known.
 */
export function planElapsedSeconds(steps: readonly CommandProgressStep[] | null | undefined): number | null {
  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const step of stepsOf({ steps })) {
    const started = step.startedAt ? Date.parse(step.startedAt) : Number.NaN
    const finished = step.finishedAt ? Date.parse(step.finishedAt) : Number.NaN
    if (!Number.isNaN(started)) first = Math.min(first, started)
    if (!Number.isNaN(finished)) last = Math.max(last, finished)
  }
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  return Math.max(0, Math.floor((last - first) / 1000))
}

export type ProgressPhase = 'waiting' | 'running' | 'done' | 'failed' | 'stopped'

export type ProgressSummary = Readonly<{
  phase: ProgressPhase
  /** Position for the counter: steps done, plus one while a step runs. */
  step: number
  /** Steps the server has to do (not `ready`). */
  total: number
  /** The step name line: "Installing Docker", "All 7 steps done · 03:12", "Failed at step 4 of 7 · Build". */
  title: string
  /** The step the title is about, when there is one. */
  focus: CommandProgressStep | null
}>

/**
 * The headline of a plan: where the deploy is and what it is doing. Null
 * until the plan has a step to count.
 */
export function progressSummary(progress: ProgressLike | null | undefined): ProgressSummary | null {
  const steps = stepsOf(progress)
  const counted = countedSteps(steps)
  const total = counted.length
  if (total === 0) return null
  const done = counted.filter((step) => step.state === 'done').length
  const running = runningStep(progress)
  if (running) {
    return { phase: 'running', step: stepPosition(steps, running), total, title: gerundLabel(running.label), focus: running }
  }
  const failed = failedStep(steps)
  if (failed) {
    const at = stepPosition(steps, failed)
    return { phase: 'failed', step: at, total, title: `Failed at step ${at} of ${total} · ${failed.label}`, focus: failed }
  }
  if (done === total) {
    const took = planElapsedSeconds(steps)
    const time = took == null ? '' : ` · ${formatElapsed(took)}`
    return { phase: 'done', step: total, total, title: `All ${total} steps done${time}`, focus: null }
  }
  if (counted.some((step) => step.state === 'skipped')) {
    return { phase: 'stopped', step: done, total, title: `Stopped after step ${done} of ${total}`, focus: null }
  }
  return { phase: 'waiting', step: 0, total, title: 'Getting ready', focus: counted[0] ?? null }
}

/** The line a single-line surface shows: "Step 3 of 7 · Installing Docker". Null until a step is counted. */
export function progressHeadline(progress: ProgressLike | null | undefined): string | null {
  const summary = progressSummary(progress)
  if (!summary) return null
  if (summary.phase === 'running') return stepCountText(summary.step, summary.total, summary.title)
  return summary.title
}

/** The short "Step N of M · Installing Docker" for a status chip; null unless a step is running. */
export function progressChipLabel(progress: ProgressLike | null | undefined): string | null {
  const summary = progressSummary(progress)
  if (summary?.phase !== 'running') return null
  return stepCountText(summary.step, summary.total, summary.title)
}

/**
 * The activity table's step text from the control plane's own counts. Null
 * when the row predates step reporting; "Starting · 7 steps" before the first
 * step runs, never "Step 0 of 7".
 */
export function activityStepText(
  item: Readonly<{ step: number | null; totalSteps: number | null; stepLabel?: string | null }>,
): string | null {
  if (item.step == null || item.totalSteps == null || item.totalSteps <= 0) return null
  if (item.step <= 0) return `Starting · ${item.totalSteps} steps`
  return stepCountText(item.step, item.totalSteps, item.stepLabel ? gerundLabel(item.stepLabel) : null)
}

const FIRST_TIME_SETUP_CAPTION =
  'First-time setup on this server. Installing what the app needs; this can take a few minutes.'

/**
 * The quiet line that explains a slow first deploy: shown while an `install-*`
 * step is still to run or running. Once the installs are over (or failed) the
 * line goes away.
 */
export function firstTimeSetupCaption(steps: readonly CommandProgressStep[] | null | undefined): string | null {
  const installing = stepsOf({ steps }).some(
    (step) => step.id.startsWith('install-') && (step.state === 'pending' || step.state === 'running'),
  )
  return installing ? FIRST_TIME_SETUP_CAPTION : null
}

export type StepNodeInfo = Readonly<{
  /** The state in a word, read beside the label ("Install Docker: done"). */
  word: string
  glyph: GlyphKey | null
  tone: StatusTone
  /** True for the two ticked states: the segment after the node is filled. */
  complete: boolean
}>

const STEP_NODES: Readonly<Record<CommandProgressStepState, StepNodeInfo>> = {
  ready: { word: 'already on this server', glyph: 'check', tone: 'ok', complete: true },
  done: { word: 'done', glyph: 'check', tone: 'ok', complete: true },
  running: { word: 'in progress', glyph: 'spinner', tone: 'busy', complete: false },
  pending: { word: 'not started', glyph: null, tone: 'idle', complete: false },
  failed: { word: 'failed', glyph: 'diamond', tone: 'bad', complete: false },
  skipped: { word: 'skipped', glyph: 'dashed', tone: 'idle', complete: false },
}

/** Word, glyph and tone for a step state; an unknown state reads as not started. */
export function stepNodeInfo(state: string): StepNodeInfo {
  return Object.hasOwn(STEP_NODES, state) ? STEP_NODES[state as CommandProgressStepState] : STEP_NODES.pending
}

/**
 * What a screen reader hears for one node: "Step 3 of 7, Install Docker, in
 * progress"; a step already on the server has no position.
 */
export function stepAccessibilityLabel(
  steps: readonly CommandProgressStep[] | null | undefined,
  step: CommandProgressStep,
): string {
  const info = stepNodeInfo(step.state)
  const position = stepPosition(steps, step)
  if (position === 0) return `${step.label}, ${info.word}`
  return `Step ${position} of ${countedSteps(steps).length}, ${step.label}, ${info.word}`
}

/** `03` for the mono counter: two digits, more when the plan is that long. */
export function counterDigits(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}
