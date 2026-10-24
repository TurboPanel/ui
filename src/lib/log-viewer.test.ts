import { describe, expect, it } from 'vitest'
import type { LogTranscriptLine } from '@/lib/execution-log-lines'
import type { CommandProgressStep, CommandProgressStepState } from '@/lib/instance-api'
import {
  buildLogSteps,
  buildLogViewerModel,
  defaultOpenStepIds,
  EMPTY_LOG_FILTER,
  filterStepLines,
  firstErrorItemIndex,
  firstErrorStepId,
  isFiltering,
  isNoiseLine,
  lineLevel,
  liveState,
  matchCountText,
  matchSegments,
  nextLivePaused,
  shouldPollLog,
  type LogFilter,
  type LogStep,
  type LogViewerOptions,
} from './log-viewer'

let seq = 0

function line(
  message: string,
  phase: string | null,
  extra?: Partial<Pick<LogTranscriptLine, 'stream' | 'timestamp' | 'seq'>>
): LogTranscriptLine {
  seq += 1
  return {
    seq: extra?.seq ?? seq,
    timestamp: extra && 'timestamp' in extra ? (extra.timestamp ?? null) : null,
    stream: extra?.stream ?? 'stdout',
    phase,
    message,
  }
}

function err(message: string, phase: string | null): LogTranscriptLine {
  return line(message, phase, { stream: 'stderr' })
}

function planStep(id: string, state: CommandProgressStepState, label = id): CommandProgressStep {
  return { id, label, state }
}

/** A failed build: Prepare, Fetch, Install, Build (fails), Start and Health skipped. */
function failedBuild(): { lines: LogTranscriptLine[]; plan: CommandProgressStep[] } {
  const lines = [
    line('Deploy started', 'prepare', { timestamp: '2026-10-24T10:00:00.000Z' }),
    line('Server accepted the deploy', 'prepare', { timestamp: '2026-10-24T10:00:02.000Z' }),
    line('Fetching TurboPanel/website', 'fetch'),
    line('Checked out 1a2b3c4', 'fetch'),
    line('Installing Node 22', 'install-runtime'),
    line('Running the build script', 'build'),
    line('Compiling 84 files', 'build'),
    line('Checking types', 'build'),
    err("src/pricing.ts:14:7 error: Property 'tiers' does not exist", 'build'),
    err('warn: 2 packages are deprecated', 'build'),
    err('Build failed: the build script exited with code 1', 'build'),
    line('Nothing changed on the server', 'build'),
  ]
  const plan = [
    planStep('install-docker', 'ready', 'Install Docker'),
    planStep('install-runtime:node-22', 'done', 'Install Node 22'),
    planStep('fetch', 'done', 'Fetch the code'),
    planStep('build', 'failed', 'Build'),
    planStep('start', 'skipped', 'Start the app'),
    planStep('health', 'skipped', 'Check it answers'),
  ]
  return { lines, plan }
}

const OPTIONS: LogViewerOptions = {
  filter: EMPTY_LOG_FILTER,
  openIds: new Set(),
  noiseShownIds: new Set(),
  grouped: true,
}

function stepItems(model: ReturnType<typeof buildLogViewerModel>) {
  return model.items.filter((item) => item.kind === 'step')
}

describe('lineLevel and isNoiseLine', () => {
  it('reads stderr diagnostics as errors and warn words as warnings', () => {
    expect(lineLevel(err('Build failed', 'build'))).toBe('error')
    expect(lineLevel(err('npm WARN deprecated left-pad', 'build'))).toBe('warn')
    expect(lineLevel(err('Warning: low disk', 'build'))).toBe('warn')
    expect(lineLevel(line('warning on stdout', 'build'))).toBeNull()
  })

  it('treats benign stderr progress as not an error', () => {
    expect(lineLevel(err('Image nginx Pulling', 'pull'))).toBeNull()
  })

  it('folds Prepare housekeeping and stderr progress, never errors', () => {
    expect(isNoiseLine(line('Reading saved settings', 'prepare'))).toBe(true)
    expect(isNoiseLine(err('Prepare failed', 'prepare'))).toBe(false)
    expect(isNoiseLine(err('Image nginx Pulling', 'pull'))).toBe(true)
    expect(isNoiseLine(line('Image nginx Pulling', 'pull'))).toBe(false)
    expect(isNoiseLine(line('Compiling', 'build'))).toBe(false)
  })
})

describe('buildLogSteps', () => {
  it('groups consecutive phases into labelled steps', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    expect(steps.map((step) => step.label)).toEqual([
      'Prepare',
      'Fetch source',
      'Installing the runtime',
      'Build',
      'Start the app',
      'Check it answers',
    ])
    expect(steps.map((step) => step.lines.length)).toEqual([2, 2, 1, 7, 0, 0])
  })

  it('takes each step state from the plan and lists silent skipped steps', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    expect(steps.map((step) => step.status)).toEqual([
      'ok',
      'ok',
      'ok',
      'failed',
      'skipped',
      'skipped',
    ])
    expect(steps[4]?.id).toBe('plan:start')
  })

  it('counts errors (not warnings) and measures duration from timestamps', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    expect(steps[3]?.errorCount).toBe(2)
    expect(steps[0]?.durationMs).toBe(2000)
    expect(steps[1]?.durationMs).toBeNull()
  })

  it('marks only the last group of a repeated failed phase', () => {
    const lines = [
      line('fetch one', 'fetch'),
      line('build one', 'build'),
      line('fetch two', 'fetch'),
      err('fatal: could not read', 'fetch'),
    ]
    const steps = buildLogSteps(
      lines,
      [planStep('fetch', 'failed'), planStep('build', 'done')],
      'failed'
    )
    expect(steps.map((step) => step.status)).toEqual(['ok', 'ok', 'failed'])
  })

  it('maps the start phases onto the start step and keeps it running', () => {
    const lines = [line('promote', 'release-promote'), line('up', 'compose-up')]
    const steps = buildLogSteps(
      lines,
      [planStep('start', 'running'), planStep('health', 'pending')],
      'running'
    )
    expect(steps.map((step) => step.status)).toEqual(['ok', 'running', 'pending'])
  })

  it('reads a plan step that is pending or mixed as pending, ready as ok', () => {
    const lines = [line('a', 'install-runtime'), line('b', 'install-docker')]
    const steps = buildLogSteps(
      lines,
      [
        planStep('install-runtime:node-22', 'done'),
        planStep('install-runtime:deno-2', 'pending'),
        planStep('install-docker', 'ready'),
      ],
      'running'
    )
    expect(steps.map((step) => step.status)).toEqual(['pending', 'ok'])
  })

  it('falls back to the command status for the last step without a plan', () => {
    const lines = [line('a', 'prepare'), err('boom', 'prepare'), line('b', null)]
    expect(buildLogSteps(lines, null, 'failed').map((step) => step.status)).toEqual([
      'ok',
      'failed',
    ])
    expect(buildLogSteps(lines, null, 'timed_out').at(-1)?.status).toBe('failed')
    expect(buildLogSteps(lines, null, 'running').at(-1)?.status).toBe('running')
    expect(buildLogSteps(lines, null, 'succeeded').at(-1)?.status).toBe('ok')
    expect(buildLogSteps(lines, null, 'cancelled').at(-1)?.status).toBe('ok')
    expect(buildLogSteps(lines, null, null).at(-1)?.status).toBe('ok')
    expect(buildLogSteps(lines, null, 'failed').at(-1)?.label).toBe('Output')
  })

  it('does not blame the last unplanned step when the plan names the failure', () => {
    const lines = [err('build broke', 'build'), line('cleanup', 'hooks')]
    const steps = buildLogSteps(lines, [planStep('build', 'failed')], 'failed')
    expect(steps.map((step) => step.status)).toEqual(['failed', 'ok'])
  })

  it('hides done and ready plan steps that printed nothing', () => {
    const steps = buildLogSteps(
      [],
      [planStep('certificates', 'done'), planStep('install-docker', 'ready')],
      'succeeded'
    )
    expect(steps).toEqual([])
  })

  it('collapses repeated progress ticks before grouping', () => {
    const lines = [err('Image nginx Extracting', 'pull'), err('Image nginx Extracting', 'pull')]
    expect(buildLogSteps(lines, null, 'succeeded')[0]?.lines).toHaveLength(1)
  })
})

describe('defaultOpenStepIds', () => {
  it('opens only the failed step', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    expect(defaultOpenStepIds(steps)).toEqual([steps[3]?.id])
  })

  it('opens the running step while a deploy runs', () => {
    const lines = [line('a', 'fetch'), line('b', 'build')]
    const steps = buildLogSteps(
      lines,
      [planStep('fetch', 'done'), planStep('build', 'running')],
      'running'
    )
    expect(defaultOpenStepIds(steps)).toEqual([steps[1]?.id])
  })

  it('opens the first step when all passed, and nothing for an empty log', () => {
    const lines = [line('a', 'prepare'), line('b', 'build')]
    const steps = buildLogSteps(lines, [planStep('build', 'done')], 'succeeded')
    expect(defaultOpenStepIds(steps)).toEqual([steps[0]?.id])
    expect(defaultOpenStepIds([])).toEqual([])
  })

  it('ignores a failed step with no output', () => {
    const steps = buildLogSteps(
      [line('a', 'build')],
      [planStep('build', 'done'), planStep('health', 'failed')],
      'failed'
    )
    expect(defaultOpenStepIds(steps)).toEqual([steps[0]?.id])
  })
})

describe('filterStepLines', () => {
  const lines = [
    line('one', 'build'),
    line('two', 'build'),
    line('three', 'build'),
    line('alpha four', 'build'),
    line('five', 'build'),
    line('six', 'build'),
    line('seven', 'build'),
    line('eight', 'build'),
    line('nine', 'build'),
    line('ALPHA ten', 'build'),
  ]

  it('returns every line and no hits when nothing filters', () => {
    const result = filterStepLines(lines, EMPTY_LOG_FILTER, false)
    expect(result.rows).toHaveLength(10)
    expect(result.hits).toBe(0)
  })

  it('Highlight keeps two lines of context either side with a gap between runs', () => {
    const filter: LogFilter = { query: 'alpha', mode: 'highlight', errorsOnly: false }
    const result = filterStepLines(lines, filter, false)
    expect(result.hits).toBe(2)
    const shown = result.rows.map((row) => (row.kind === 'gap' ? '…' : row.line.message))
    expect(shown).toEqual([
      'two',
      'three',
      'alpha four',
      'five',
      'six',
      '…',
      'eight',
      'nine',
      'ALPHA ten',
    ])
    const contexts = result.rows.map((row) => (row.kind === 'line' ? row.context : null))
    expect(contexts[2]).toBe(false)
    expect(contexts[0]).toBe(true)
  })

  it('Only matching shows the matches alone', () => {
    const filter: LogFilter = { query: 'alpha', mode: 'only', errorsOnly: false }
    const result = filterStepLines(lines, filter, false)
    expect(result.rows.map((row) => (row.kind === 'line' ? row.line.message : '…'))).toEqual([
      'alpha four',
      'ALPHA ten',
    ])
  })

  it('the errors filter alone narrows to error and warning rows', () => {
    const mixed = [line('ok', 'build'), err('bad thing', 'build'), err('warn: old', 'build')]
    const filter: LogFilter = { query: '', mode: 'highlight', errorsOnly: true }
    const result = filterStepLines(mixed, filter, false)
    expect(result.hits).toBe(2)
    expect(result.rows).toHaveLength(2)
  })

  it('folds setup noise unless shown, and search still reaches it', () => {
    const setup = [line('Deploy started', 'prepare'), err('Prepare broke', 'prepare')]
    expect(filterStepLines(setup, EMPTY_LOG_FILTER, false)).toMatchObject({ foldedNoise: 1 })
    expect(filterStepLines(setup, EMPTY_LOG_FILTER, true).rows).toHaveLength(2)
    const search: LogFilter = { query: 'started', mode: 'only', errorsOnly: false }
    expect(filterStepLines(setup, search, false).hits).toBe(1)
  })
})

describe('buildLogViewerModel', () => {
  it('shows closed headers only, by default', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    const model = buildLogViewerModel(steps, OPTIONS)
    expect(model.items.every((item) => item.kind === 'step')).toBe(true)
    expect(stepItems(model).every((item) => item.kind === 'step' && !item.open)).toBe(true)
  })

  it('renders lines and the setup fold of open steps', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    const prepare = steps[0] as LogStep
    const model = buildLogViewerModel(steps, { ...OPTIONS, openIds: new Set([prepare.id]) })
    const noise = model.items.find((item) => item.kind === 'noise')
    expect(noise).toMatchObject({ stepId: prepare.id, count: 2 })
    const unfolded = buildLogViewerModel(steps, {
      ...OPTIONS,
      openIds: new Set([prepare.id]),
      noiseShownIds: new Set([prepare.id]),
    })
    expect(unfolded.items.filter((item) => item.kind === 'line')).toHaveLength(2)
  })

  it('search reaches into closed steps and opens the ones with matches', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    const filter: LogFilter = { query: 'check', mode: 'highlight', errorsOnly: false }
    const model = buildLogViewerModel(steps, { ...OPTIONS, filter })
    expect(model.total).toBe(2)
    const headers = stepItems(model)
    const open = headers.filter((item) => item.kind === 'step' && item.open)
    expect(open.map((item) => (item.kind === 'step' ? item.step.label : ''))).toEqual([
      'Fetch source',
      'Build',
    ])
    expect(open.map((item) => (item.kind === 'step' ? item.hits : null))).toEqual([1, 1])
    expect(matchCountText(filter, model.total)).toBe('2 found')
  })

  it('a search with no match closes every step and says so', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    const filter: LogFilter = { query: 'zzz', mode: 'only', errorsOnly: false }
    const model = buildLogViewerModel(steps, {
      ...OPTIONS,
      openIds: new Set([steps[3]?.id ?? '']),
      filter,
    })
    expect(model.items.at(-1)).toMatchObject({ kind: 'empty', text: 'No lines match.' })
    expect(stepItems(model).some((item) => item.kind === 'step' && item.open)).toBe(false)
  })

  it('numbers gap rows uniquely inside a step', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      line(index % 7 === 0 ? 'hit' : 'x', 'build')
    )
    const steps = buildLogSteps(many, null, 'succeeded')
    const filter: LogFilter = { query: 'hit', mode: 'highlight', errorsOnly: false }
    const keys = buildLogViewerModel(steps, { ...OPTIONS, filter }).items.map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('an ungrouped log has no headers and is always open', () => {
    const steps = buildLogSteps([line('GET / 200', null), err('boom', null)], null, null)
    const model = buildLogViewerModel(steps, { ...OPTIONS, grouped: false })
    expect(model.items.map((item) => item.kind)).toEqual(['line', 'line'])
    expect(firstErrorItemIndex(model.items)).toBe(1)
  })

  it('finds the first error step and row', () => {
    const { lines, plan } = failedBuild()
    const steps = buildLogSteps(lines, plan, 'failed')
    expect(firstErrorStepId(steps)).toBe(steps[3]?.id)
    expect(firstErrorStepId([])).toBeNull()
    expect(firstErrorItemIndex(buildLogViewerModel(steps, OPTIONS).items)).toBe(-1)
  })
})

describe('isFiltering and matchCountText', () => {
  it('ignores a blank query', () => {
    expect(isFiltering({ query: '   ', mode: 'highlight', errorsOnly: false })).toBe(false)
    expect(isFiltering({ query: '', mode: 'only', errorsOnly: true })).toBe(true)
    expect(matchCountText(EMPTY_LOG_FILTER, 4)).toBe('')
  })
})

describe('matchSegments', () => {
  it('splits a line around every case-insensitive match', () => {
    expect(matchSegments('Error and error', 'error')).toEqual([
      { text: 'Error', match: true },
      { text: ' and ', match: false },
      { text: 'error', match: true },
    ])
    expect(matchSegments('a b a', 'b')).toEqual([
      { text: 'a ', match: false },
      { text: 'b', match: true },
      { text: ' a', match: false },
    ])
  })

  it('returns the whole line when there is no query', () => {
    expect(matchSegments('plain', ' ')).toEqual([{ text: 'plain', match: false }])
  })
})

describe('Live switch', () => {
  it('is off once the deploy is not running, else on or paused', () => {
    expect(liveState(false, false)).toBe('off')
    expect(liveState(false, true)).toBe('off')
    expect(liveState(true, false)).toBe('on')
    expect(liveState(true, true)).toBe('paused')
  })

  it('toggles, pauses on scroll-away and resets when the deploy finishes', () => {
    expect(nextLivePaused(false, 'toggle')).toBe(true)
    expect(nextLivePaused(true, 'toggle')).toBe(false)
    expect(nextLivePaused(false, 'scrolled-away')).toBe(true)
    expect(nextLivePaused(true, 'finished')).toBe(false)
  })

  it('stops reading while paused, reads a finished deploy once, and reads on to the seal', () => {
    expect(shouldPollLog({ running: true, paused: false, openedFinished: false })).toBe(true)
    expect(shouldPollLog({ running: true, paused: true, openedFinished: false })).toBe(false)
    expect(shouldPollLog({ running: false, paused: true, openedFinished: false })).toBe(true)
    expect(shouldPollLog({ running: false, paused: false, openedFinished: true })).toBe(false)
  })
})
