/**
 * The log viewer's model: deploy output grouped into steps, which steps open
 * by themselves, search across every step (closed ones too), the two filter
 * styles and the Live switch. Pure functions only, so the viewer component
 * just renders what this returns. Rules: `design-system/turbopanel/pages/deploy-logs.md`.
 *
 * Steps come from data the transcript already carries: each line's `phase`
 * (consecutive lines with one phase are one step) and, when the server sent
 * one, the deploy's step plan (`CommandProgress`) for each step's state.
 */
import {
  collapseRepeatedProgressLines,
  groupTranscriptByPhase,
  isBenignStderrLine,
  isErrorLine,
  phaseLabel,
  type LogTranscriptLine,
} from '@/lib/execution-log-lines'
import type { CommandProgressStep, CommandStatus } from '@/lib/instance-api'
import type { CommandLogState } from '@/lib/queries/execution-logs'

/** How a step ended, or where it is. */
export type LogStepStatus = 'ok' | 'failed' | 'running' | 'skipped' | 'pending'

/** Error or warning row; null for ordinary output. */
export type LogLineLevel = 'error' | 'warn' | null

export type LogStep = Readonly<{
  /** Stable within one transcript: phase plus the first line's sequence. */
  id: string
  phase: string | null
  label: string
  status: LogStepStatus
  lines: readonly LogTranscriptLine[]
  /** Error rows (warnings not counted). */
  errorCount: number
  /** Milliseconds from the first to the last line; null without timestamps or with one line. */
  durationMs: number | null
  /** The line a finished plan step left behind (the certificates step's note); absent when none. */
  detail?: string
}>

/** Lines of context kept on each side of a match in Highlight mode. */
export const MATCH_CONTEXT_LINES = 2

/** The phase whose housekeeping lines fold away as setup noise. */
const SETUP_PHASE = 'prepare'

/** Header for lines that arrived without a phase. */
const UNPHASED_LABEL = 'Output'

/**
 * Warn words, plus Node's process warnings (`DeprecationWarning`,
 * `ExperimentalWarning`, …), which tools print on stderr while the build goes on.
 */
const WARN_PATTERN = /\b(?:warn|warning|deprecated|deprecation)\b|\b[a-z]+warning\b/i

/**
 * Hand mirror of the server's phase-to-step table (`PHASE_STEPS` in the
 * daemon's deploy progress). Install phases match their steps by prefix
 * (`install-runtime` covers `install-runtime:node-22`).
 */
const PHASE_PLAN_STEP: Readonly<Record<string, string>> = {
  fetch: 'fetch',
  build: 'build',
  'release-promote': 'start',
  'pre-deploy': 'start',
  'compose-up': 'start',
  'post-deploy': 'start',
  'start-release': 'start',
  health: 'health',
  'switch-traffic': 'switch',
  'stop-old-release': 'stop-old',
}

/**
 * Rows that are errors whatever else they say: a thrown error (`Error:`,
 * `TypeError: …`), npm's error lines, and Node's unhandled rejection, which is
 * named a warning but means the program lost an error.
 */
const ERROR_PATTERN = /^\s*\w*Error\b|^npm (?:ERR!|error )|UnhandledPromiseRejectionWarning/

/** Error, warning or neither. Only rows `isErrorLine` flags can be either; the error check wins. */
export function lineLevel(line: LogTranscriptLine): LogLineLevel {
  if (!isErrorLine(line)) return null
  if (ERROR_PATTERN.test(line.message)) return 'error'
  return WARN_PATTERN.test(line.message) ? 'warn' : 'error'
}

/**
 * Setup noise, folded behind "Show N setup lines" inside an open step:
 * housekeeping in the Prepare step and progress that tools print on stderr
 * (image layers, git progress, package manager counters). Errors and
 * warnings are never noise.
 */
export function isNoiseLine(line: LogTranscriptLine): boolean {
  if (lineLevel(line) !== null) return false
  if (line.phase === SETUP_PHASE) return true
  return line.stream === 'stderr' && isBenignStderrLine(line.message)
}

/** Plan steps a phase reports into. */
function planStepsForPhase(
  phase: string | null,
  plan: readonly CommandProgressStep[]
): CommandProgressStep[] {
  if (!phase) return []
  if (phase.startsWith('install-')) {
    return plan.filter((step) => step.id === phase || step.id.startsWith(`${phase}:`))
  }
  const id = PHASE_PLAN_STEP[phase]
  return id ? plan.filter((step) => step.id === id) : []
}

/** One status for several plan steps: failed, then running, then the rest. */
function planStatus(steps: readonly CommandProgressStep[]): LogStepStatus | null {
  if (steps.length === 0) return null
  if (steps.some((step) => step.state === 'failed')) return 'failed'
  if (steps.some((step) => step.state === 'running')) return 'running'
  if (steps.every((step) => step.state === 'skipped')) return 'skipped'
  if (steps.some((step) => step.state === 'pending')) return 'pending'
  return 'ok'
}

/** What the last step reads as when the plan cannot say. */
function outcomeStatus(status: CommandStatus | null): LogStepStatus {
  if (status === 'failed' || status === 'timed_out') return 'failed'
  if (status === null || status === 'succeeded' || status === 'cancelled') return 'ok'
  return 'running'
}

function durationOf(lines: readonly LogTranscriptLine[]): number | null {
  // One line has no length of time worth showing.
  if (lines.length < 2) return null
  const first = Date.parse(lines[0]?.timestamp ?? '')
  const last = Date.parse(lines.at(-1)?.timestamp ?? '')
  if (Number.isNaN(first) || Number.isNaN(last)) return null
  return Math.max(0, last - first)
}

type DraftStep = {
  id: string
  phase: string | null
  label: string
  planned: CommandProgressStep[]
  status: LogStepStatus | null
  lines: LogTranscriptLine[]
}

/**
 * A failed or running plan step marks only the last group that reported into
 * it: a phase that came round again (one fetch per release) finished the
 * earlier time.
 */
function settleRepeatedPlanSteps(drafts: DraftStep[]): void {
  const seen = new Set<string>()
  for (let index = drafts.length - 1; index >= 0; index--) {
    const draft = drafts[index]
    if (!draft || draft.planned.length === 0) continue
    const key = draft.planned.map((step) => step.id).join(',')
    if (seen.has(key) && (draft.status === 'failed' || draft.status === 'running')) {
      draft.status = 'ok'
    }
    seen.add(key)
  }
}

/** The note a finished plan step left, trimmed; undefined when it left none. */
function finishedDetail(steps: readonly CommandProgressStep[]): string | undefined {
  const detail = steps.find((step) => step.state === 'done' && step.detail?.trim())?.detail?.trim()
  return detail || undefined
}

/**
 * Plan steps that never printed a line (skipped, still to run, or done without
 * output, such as setting up certificates), in plan order. Only a step that
 * was already in place on the server is left out.
 */
function silentPlanSteps(
  plan: readonly CommandProgressStep[],
  drafts: readonly DraftStep[]
): { planIndex: number; step: LogStep }[] {
  const reported = new Set(drafts.flatMap((draft) => draft.planned.map((step) => step.id)))
  return plan.flatMap((step, planIndex) => {
    if (step.state === 'ready' || reported.has(step.id)) return []
    const detail = finishedDetail([step])
    return [
      {
        planIndex,
        step: {
          id: `plan:${step.id}`,
          phase: null,
          label: step.label,
          status: planStatus([step]) ?? 'pending',
          lines: [],
          errorCount: 0,
          durationMs: null,
          ...(detail ? { detail } : {}),
        },
      },
    ]
  })
}

/**
 * The silent steps woven in where the plan puts them: each goes before the
 * first reported step that comes later in the plan; steps no plan step covers
 * keep their place.
 */
function inPlanOrder(
  reported: readonly { planIndex: number | null; step: LogStep }[],
  silent: readonly { planIndex: number; step: LogStep }[]
): LogStep[] {
  const out: LogStep[] = []
  let next = 0
  for (const entry of reported) {
    let waiting = silent[next]
    while (entry.planIndex !== null && waiting && waiting.planIndex < entry.planIndex) {
      out.push(waiting.step)
      next += 1
      waiting = silent[next]
    }
    out.push(entry.step)
  }
  return [...out, ...silent.slice(next).map((entry) => entry.step)]
}

/**
 * Group a transcript into steps. `plan` is the deploy's step plan when the
 * server sent one; `status` is the command's status, used for the last step
 * when no plan step covers it (an older server, or a failure in Prepare).
 */
export function buildLogSteps(
  lines: readonly LogTranscriptLine[],
  plan: readonly CommandProgressStep[] | null,
  status: CommandStatus | null
): LogStep[] {
  const planSteps = plan ?? []
  const drafts: DraftStep[] = groupTranscriptByPhase(collapseRepeatedProgressLines(lines)).map(
    (group, index) => {
      const planned = planStepsForPhase(group.phase, planSteps)
      return {
        id: `${group.phase ?? 'output'}:${group.lines[0]?.seq ?? index}`,
        phase: group.phase,
        label: group.phase ? phaseLabel(group.phase) : UNPHASED_LABEL,
        planned,
        status: planStatus(planned),
        lines: [...group.lines],
      }
    }
  )
  settleRepeatedPlanSteps(drafts)
  const planDecided = drafts.some((draft) => draft.status === 'failed')
  const steps = drafts.map((draft, index) => {
    let resolved = draft.status
    if (resolved === null) {
      const last = index === drafts.length - 1
      resolved = last && !planDecided ? outcomeStatus(status) : 'ok'
    }
    const detail = finishedDetail(draft.planned)
    const step: LogStep = {
      id: draft.id,
      phase: draft.phase,
      label: draft.label,
      status: resolved,
      lines: draft.lines,
      errorCount: draft.lines.filter((line) => lineLevel(line) === 'error').length,
      durationMs: durationOf(draft.lines),
      ...(detail ? { detail } : {}),
    }
    const indexes = draft.planned.map((planned) => planSteps.indexOf(planned))
    return { planIndex: indexes.length > 0 ? Math.min(...indexes) : null, step }
  })
  return inPlanOrder(steps, silentPlanSteps(planSteps, drafts))
}

/**
 * Steps open on arrival: the failed step; else the running one; else the
 * first step with output. Everything else starts closed.
 */
export function defaultOpenStepIds(steps: readonly LogStep[]): string[] {
  const withLines = steps.filter((step) => step.lines.length > 0)
  const failed = withLines.find((step) => step.status === 'failed')
  if (failed) return [failed.id]
  const running = withLines.findLast((step) => step.status === 'running')
  if (running) return [running.id]
  const first = withLines[0]
  return first ? [first.id] : []
}

/** Highlight keeps the lines around each match; Only shows the matches alone. */
export type LogFilterMode = 'highlight' | 'only'

export type LogFilter = Readonly<{
  query: string
  mode: LogFilterMode
  /** Only error and warning rows (chosen by the person, never on by default). */
  errorsOnly: boolean
}>

export const EMPTY_LOG_FILTER: LogFilter = { query: '', mode: 'highlight', errorsOnly: false }

/** True when search or the errors filter narrows the view. */
export function isFiltering(filter: LogFilter): boolean {
  return filter.query.trim().length > 0 || filter.errorsOnly
}

function matchesQuery(message: string, query: string): boolean {
  return query.length === 0 || foldCase(message).includes(foldCase(query))
}

function isHit(line: LogTranscriptLine, filter: LogFilter, query: string): boolean {
  if (filter.errorsOnly && lineLevel(line) === null) return false
  return matchesQuery(line.message, query)
}

export type LogRow =
  Readonly<{ kind: 'line'; line: LogTranscriptLine; context: boolean }> | Readonly<{ kind: 'gap' }>

export type FilteredLines = Readonly<{
  rows: readonly LogRow[]
  /** Lines matching the filter (0 when nothing filters). */
  hits: number
  /** Setup lines left folded (only when nothing filters). */
  foldedNoise: number
}>

/**
 * The rows one step shows. Search and the errors filter look at every line,
 * folded setup noise included; with neither, noise folds unless `showNoise`.
 */
export function filterStepLines(
  lines: readonly LogTranscriptLine[],
  filter: LogFilter,
  showNoise: boolean
): FilteredLines {
  const query = filter.query.trim()
  if (!isFiltering(filter)) {
    const shown = showNoise ? lines : lines.filter((line) => !isNoiseLine(line))
    return {
      rows: shown.map((line) => ({ kind: 'line', line, context: false })),
      hits: 0,
      foldedNoise: lines.length - shown.length,
    }
  }
  const hit = lines.map((line) => isHit(line, filter, query))
  const hits = hit.filter(Boolean).length
  if (filter.mode === 'only' || query.length === 0) {
    return {
      rows: lines
        .filter((_, index) => hit[index])
        .map((line) => ({ kind: 'line', line, context: false })),
      hits,
      foldedNoise: 0,
    }
  }
  return { rows: withContext(lines, hit), hits, foldedNoise: 0 }
}

/** Matches plus {@link MATCH_CONTEXT_LINES} either side, a gap row between runs. */
function withContext(lines: readonly LogTranscriptLine[], hit: readonly boolean[]): LogRow[] {
  const keep = lines.map(() => false)
  hit.forEach((isMatch, index) => {
    if (!isMatch) return
    const from = Math.max(0, index - MATCH_CONTEXT_LINES)
    const to = Math.min(lines.length - 1, index + MATCH_CONTEXT_LINES)
    for (let at = from; at <= to; at++) keep[at] = true
  })
  const rows: LogRow[] = []
  let skipped = false
  lines.forEach((line, index) => {
    if (!keep[index]) {
      skipped = true
      return
    }
    if (skipped && rows.length > 0) rows.push({ kind: 'gap' })
    skipped = false
    rows.push({ kind: 'line', line, context: !hit[index] })
  })
  return rows
}

/** One row of the virtualized list. */
export type LogViewerItem =
  | Readonly<{
      kind: 'step'
      key: string
      step: LogStep
      open: boolean
      /** Matches inside the step while filtering, else null. */
      hits: number | null
    }>
  | Readonly<{
      kind: 'line'
      key: string
      stepId: string
      line: LogTranscriptLine
      level: LogLineLevel
      context: boolean
    }>
  | Readonly<{ kind: 'gap'; key: string }>
  | Readonly<{ kind: 'noise'; key: string; stepId: string; count: number }>
  | Readonly<{ kind: 'empty'; key: string; text: string }>

export type LogViewerModel = Readonly<{
  items: readonly LogViewerItem[]
  /** Matches across every step, open or closed. */
  total: number
}>

export type LogViewerOptions = Readonly<{
  filter: LogFilter
  /** Steps the person opened (or that opened by themselves). */
  openIds: ReadonlySet<string>
  /** Steps whose setup lines the person unfolded. */
  noiseShownIds: ReadonlySet<string>
  /** False for an ungrouped log (runtime output): no step headers, always open. */
  grouped: boolean
}>

function lineItems(stepId: string, rows: readonly LogRow[]): LogViewerItem[] {
  let gaps = 0
  return rows.map((row) => {
    if (row.kind === 'gap') {
      gaps += 1
      return { kind: 'gap', key: `${stepId}:gap:${gaps}` }
    }
    return {
      kind: 'line',
      key: `${stepId}:${row.line.seq}:${row.line.stream}`,
      stepId,
      line: row.line,
      level: lineLevel(row.line),
      context: row.context,
    }
  })
}

/**
 * Flatten steps into list rows. While filtering, a step is open exactly when
 * it has matches (search reaches into closed steps); otherwise the open set
 * decides.
 */
export function buildLogViewerModel(
  steps: readonly LogStep[],
  options: LogViewerOptions
): LogViewerModel {
  const filtering = isFiltering(options.filter)
  const items: LogViewerItem[] = []
  let total = 0
  for (const step of steps) {
    const filtered = filterStepLines(step.lines, options.filter, options.noiseShownIds.has(step.id))
    total += filtered.hits
    const open = !options.grouped || (filtering ? filtered.hits > 0 : options.openIds.has(step.id))
    if (options.grouped) {
      items.push({
        kind: 'step',
        key: `step:${step.id}`,
        step,
        open,
        hits: filtering ? filtered.hits : null,
      })
    }
    if (!open) continue
    items.push(...lineItems(step.id, filtered.rows))
    if (filtered.foldedNoise > 0) {
      items.push({
        kind: 'noise',
        key: `${step.id}:noise`,
        stepId: step.id,
        count: filtered.foldedNoise,
      })
    }
  }
  if (filtering && total === 0) {
    items.push({ kind: 'empty', key: 'empty', text: 'No lines match.' })
  }
  return { items, total }
}

/** "3 found", "1 found"; empty when nothing is searched. */
export function matchCountText(filter: LogFilter, total: number): string {
  return isFiltering(filter) ? `${total} found` : ''
}

/** The step holding the first error row, or null. */
export function firstErrorStepId(steps: readonly LogStep[]): string | null {
  return steps.find((step) => step.errorCount > 0)?.id ?? null
}

/** Index of the first error row in the list, or -1. */
export function firstErrorItemIndex(items: readonly LogViewerItem[]): number {
  return items.findIndex((item) => item.kind === 'line' && item.level === 'error')
}

/** A piece of a line for highlighting: matched text or not. */
export type MatchSegment = Readonly<{ text: string; match: boolean }>

/**
 * Lower-case a string one UTF-16 unit at a time, leaving any unit whose lower
 * case has a different length (`İ` lower-cases to two units) as it is. The
 * result is exactly as long as the input, so an offset found in it is an
 * offset in the original text.
 */
export function foldCase(text: string): string {
  let folded = ''
  for (let index = 0; index < text.length; index++) {
    const unit = text.charAt(index)
    const lower = unit.toLowerCase()
    folded += lower.length === unit.length ? lower : unit
  }
  return folded
}

/** Split a line around every case-insensitive occurrence of `query`. */
export function matchSegments(text: string, query: string): MatchSegment[] {
  const needle = foldCase(query.trim())
  if (needle.length === 0) return [{ text, match: false }]
  const haystack = foldCase(text)
  const segments: MatchSegment[] = []
  let from = 0
  let at = haystack.indexOf(needle, from)
  while (at !== -1) {
    if (at > from) segments.push({ text: text.slice(from, at), match: false })
    segments.push({ text: text.slice(at, at + needle.length), match: true })
    from = at + needle.length
    at = haystack.indexOf(needle, from)
  }
  if (from < text.length) segments.push({ text: text.slice(from), match: false })
  return segments
}

/**
 * The Live switch. Available only while the log is still being written; the
 * person can pause it (scrolling up pauses it too), and it is gone once the
 * deploy finishes.
 */
export type LiveState = 'on' | 'paused' | 'off'

export function liveState(running: boolean, paused: boolean): LiveState {
  if (!running) return 'off'
  return paused ? 'paused' : 'on'
}

export type LiveEvent = 'toggle' | 'scrolled-away' | 'finished'

/** Next `paused` flag after an event. Finishing clears it for the next run. */
export function nextLivePaused(paused: boolean, event: LiveEvent): boolean {
  if (event === 'toggle') return !paused
  if (event === 'scrolled-away') return true
  return false
}

/**
 * Whether the transcript keeps reading (`useCommandLog` itself stops once the
 * transcript is sealed). A deploy that had already finished when the page
 * opened is read once. A paused view stops reading while the deploy runs;
 * after the deploy ends it reads on until sealed, so the last lines arrive.
 */
export function shouldPollLog(
  input: Readonly<{ running: boolean; paused: boolean; openedFinished: boolean }>
): boolean {
  if (input.openedFinished) return false
  return !input.running || !input.paused
}

/**
 * Viewer state for a runtime log read on demand from the server (never
 * stored): waiting for the first read, unavailable when the read failed,
 * streaming while Live re-reads it, else a finished snapshot.
 */
export function runtimeLogState(
  input: Readonly<{ hasData: boolean; failed: boolean; live: boolean }>
): CommandLogState {
  if (input.failed) return 'unavailable'
  if (!input.hasData) return 'waiting'
  return input.live ? 'streaming' : 'sealed'
}
