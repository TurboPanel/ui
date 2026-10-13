import type {
  CommandProgress,
  CommandProgressStep,
  CommandProgressStepState,
} from '@/lib/instance-api'
import type { GlyphKey, StatusTone } from '@/lib/v4/status-vocab'

/**
 * Words and numbers derived from a deploy's step plan (`CommandProgress`),
 * shared by the progress rail, the environment status line and the activity
 * table so every surface counts the same way the control plane does:
 * the total is every step that is not `ready`, the position is the steps
 * `done` plus one while a step is `running`.
 */

/** Steps that count towards "Step N of M": everything the server has to do. */
export function countedSteps(
  steps: readonly CommandProgressStep[],
): CommandProgressStep[] {
  return steps.filter((step) => step.state !== 'ready')
}

/** The running step, or null when none is. */
export function runningStep(
  progress: Pick<CommandProgress, 'steps' | 'current'>,
): CommandProgressStep | null {
  if (progress.current) {
    const byId = progress.steps.find((step) => step.id === progress.current)
    if (byId) return byId
  }
  return progress.steps.find((step) => step.state === 'running') ?? null
}

/** The step the deploy failed on, or null. */
export function failedStep(
  steps: readonly CommandProgressStep[],
): CommandProgressStep | null {
  return steps.find((step) => step.state === 'failed') ?? null
}

/** One-based position of a step among the counted ones; 0 when it is `ready`. */
export function stepPosition(
  steps: readonly CommandProgressStep[],
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
export function stepCountText(
  step: number,
  totalSteps: number,
  label?: string | null,
): string {
  const count = `Step ${step} of ${totalSteps}`
  return label ? `${count} · ${label}` : count
}

/**
 * The line under the rail: where the deploy is and what it is doing. Null
 * until the plan has a step to count.
 */
export function progressHeadline(
  progress: Pick<CommandProgress, 'steps' | 'current'>,
): string | null {
  const counted = countedSteps(progress.steps)
  const total = counted.length
  if (total === 0) return null
  const running = runningStep(progress)
  if (running) {
    return stepCountText(stepPosition(progress.steps, running), total, gerundLabel(running.label))
  }
  const failed = failedStep(progress.steps)
  if (failed) {
    return stepCountText(stepPosition(progress.steps, failed), total, `${failed.label} failed`)
  }
  const done = counted.filter((step) => step.state === 'done').length
  if (done === total) return `All ${total} steps done`
  if (counted.some((step) => step.state === 'skipped')) {
    return `Stopped after step ${done} of ${total}`
  }
  return `Getting ready · ${total} steps`
}

/** The short "Step N of M · Installing Docker" for a status chip; null unless a step is running. */
export function progressChipLabel(
  progress: Pick<CommandProgress, 'steps' | 'current'> | null | undefined,
): string | null {
  if (!progress) return null
  const running = runningStep(progress)
  if (!running) return null
  const total = countedSteps(progress.steps).length
  return stepCountText(stepPosition(progress.steps, running), total, gerundLabel(running.label))
}

/**
 * The activity table's step text from the control plane's own counts. Null
 * when the row predates step reporting.
 */
export function activityStepText(
  item: Readonly<{ step: number | null; totalSteps: number | null; stepLabel?: string | null }>,
): string | null {
  if (item.step == null || item.totalSteps == null || item.totalSteps <= 0) return null
  return stepCountText(item.step, item.totalSteps, item.stepLabel ? gerundLabel(item.stepLabel) : null)
}

const FIRST_TIME_SETUP_CAPTION =
  'First-time setup on this server. Installing what the app needs; this can take a few minutes.'

/**
 * The quiet line that explains a slow first deploy: shown while an `install-*`
 * step is still to run or running. Once the installs are over (or failed) the
 * line goes away.
 */
export function firstTimeSetupCaption(
  steps: readonly CommandProgressStep[],
): string | null {
  const installing = steps.some(
    (step) =>
      step.id.startsWith('install-') &&
      (step.state === 'pending' || step.state === 'running'),
  )
  return installing ? FIRST_TIME_SETUP_CAPTION : null
}

/** Whole seconds since `startedAt`, never negative; null when the time is missing or unreadable. */
export function elapsedSeconds(
  startedAt: string | null | undefined,
  now: number,
): number | null {
  if (!startedAt) return null
  const started = Date.parse(startedAt)
  if (Number.isNaN(started)) return null
  return Math.max(0, Math.floor((now - started) / 1000))
}

/** `mm:ss`; minutes keep counting past an hour ("72:05"). */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

export type StepNodeInfo = Readonly<{
  /** The state in a word, read beside the label ("Install Docker: done"). */
  word: string
  glyph: GlyphKey | null
  tone: StatusTone
  /** True for the two ticked states: the connector after the node is filled. */
  complete: boolean
}>

const STEP_NODES: Readonly<Record<CommandProgressStepState, StepNodeInfo>> = {
  ready: { word: 'already there', glyph: 'check', tone: 'ok', complete: true },
  done: { word: 'done', glyph: 'check', tone: 'ok', complete: true },
  running: { word: 'in progress', glyph: 'spinner', tone: 'busy', complete: false },
  pending: { word: 'not started', glyph: null, tone: 'idle', complete: false },
  failed: { word: 'failed', glyph: 'diamond', tone: 'bad', complete: false },
  skipped: { word: 'skipped', glyph: 'dashed', tone: 'idle', complete: false },
}

/** Word, glyph and tone for a step state; an unknown state reads as not started. */
export function stepNodeInfo(state: string): StepNodeInfo {
  return Object.hasOwn(STEP_NODES, state)
    ? STEP_NODES[state as CommandProgressStepState]
    : STEP_NODES.pending
}
