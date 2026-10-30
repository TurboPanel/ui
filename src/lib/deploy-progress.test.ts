import { describe, expect, it } from 'vitest'
import {
  activityStepText,
  countedSteps,
  counterDigits,
  elapsedSeconds,
  failedStep,
  certificateStepNote,
  firstTimeSetupCaption,
  formatElapsed,
  gerundLabel,
  planElapsedSeconds,
  progressChipLabel,
  liveProgressHeadline,
  progressHeadline,
  progressSummary,
  runningStep,
  stepAccessibilityLabel,
  stepCountText,
  stepNodeInfo,
  stepPosition,
  stepsOf,
  WAITING_FOR_BUILD_TEXT,
} from '@/lib/deploy-progress'
import type { CommandProgressStep, CommandProgressStepState } from '@/lib/instance-api'

function step(
  id: string,
  label: string,
  state: CommandProgressStepState,
  extra?: Partial<CommandProgressStep>
): CommandProgressStep {
  return { id, label, state, ...extra }
}

const FRESH_HOST: CommandProgressStep[] = [
  step('install-docker', 'Install Docker', 'done'),
  step('install-gateway', 'Set up the web gateway', 'ready'),
  step('install-runtime:node-22', 'Install Node 22', 'running', { detail: 'Unpack the archive' }),
  step('fetch', 'Fetch the code', 'pending'),
  step('build', 'Build', 'pending'),
  step('start', 'Start the app', 'pending'),
  step('health', 'Check it answers', 'pending'),
]

describe('gerundLabel', () => {
  it.each([
    ['Install Docker', 'Installing Docker'],
    ['Fetch the code', 'Fetching the code'],
    ['Build', 'Building'],
    ['Start the app', 'Starting the app'],
    ['Check it answers', 'Checking it answers'],
    ['Set up certificates', 'Setting up certificates'],
    ['Install PHP 8.3', 'Installing PHP 8.3'],
    ['Start the new release', 'Starting the new release'],
    ['Switch traffic', 'Switching traffic'],
    ['Stop the old release', 'Stopping the old release'],
  ])('turns %s into %s', (label, expected) => {
    expect(gerundLabel(label)).toBe(expected)
  })

  it('leaves a label with an unknown first word alone, trimmed', () => {
    expect(gerundLabel('  Warm the cache ')).toBe('Warm the cache')
    expect(gerundLabel('Certificates')).toBe('Certificates')
  })
})

describe('reading the payload', () => {
  it('tolerates a missing or malformed step list', () => {
    expect(stepsOf(null)).toEqual([])
    expect(stepsOf(undefined)).toEqual([])
    expect(stepsOf({})).toEqual([])
    expect(stepsOf({ steps: 'nope' })).toEqual([])
    expect(
      stepsOf({ steps: [null, 4, { label: 'no id' }, step('build', 'Build', 'pending')] })
    ).toEqual([step('build', 'Build', 'pending')])
    expect(countedSteps(undefined)).toEqual([])
    expect(runningStep({ steps: 7 as unknown as [], current: 'x' })).toBeNull()
    expect(failedStep(null)).toBeNull()
    expect(firstTimeSetupCaption(undefined)).toBeNull()
    expect(progressSummary({ steps: {} })).toBeNull()
  })

  it('counts every step that is not already there', () => {
    expect(countedSteps(FRESH_HOST)).toHaveLength(6)
    expect(stepPosition(FRESH_HOST, FRESH_HOST[2]!)).toBe(2)
    expect(stepPosition(FRESH_HOST, FRESH_HOST[1]!)).toBe(0)
  })

  it('finds the running step by `current` only when that step is running, then by state', () => {
    expect(runningStep({ steps: FRESH_HOST, current: 'install-runtime:node-22' })?.id).toBe(
      'install-runtime:node-22'
    )
    expect(runningStep({ steps: FRESH_HOST, current: 'fetch' })?.id).toBe('install-runtime:node-22')
    expect(runningStep({ steps: FRESH_HOST, current: 'not-a-step' })?.id).toBe(
      'install-runtime:node-22'
    )
    expect(runningStep({ steps: FRESH_HOST, current: null })?.id).toBe('install-runtime:node-22')
    expect(runningStep({ steps: [step('build', 'Build', 'pending')], current: 'build' })).toBeNull()
  })

  it('finds the failed step', () => {
    expect(failedStep(FRESH_HOST)).toBeNull()
    expect(failedStep([step('build', 'Build', 'failed')])?.id).toBe('build')
  })

  it('formats the step count with and without a label', () => {
    expect(stepCountText(3, 7, 'Installing Docker')).toBe('Step 3 of 7 · Installing Docker')
    expect(stepCountText(3, 7)).toBe('Step 3 of 7')
    expect(stepCountText(3, 7, null)).toBe('Step 3 of 7')
  })
})

describe('progressSummary', () => {
  it('says where the deploy is and what it is doing now', () => {
    expect(
      progressSummary({ steps: FRESH_HOST, current: 'install-runtime:node-22' })
    ).toMatchObject({
      phase: 'running',
      step: 2,
      total: 6,
      title: 'Installing Node 22',
      focus: FRESH_HOST[2],
    })
    expect(progressHeadline({ steps: FRESH_HOST, current: 'install-runtime:node-22' })).toBe(
      'Step 2 of 6 · Installing Node 22'
    )
  })

  it('names the step that failed', () => {
    const steps = [
      step('install-docker', 'Install Docker', 'done'),
      step('build', 'Build', 'failed'),
      step('start', 'Start the app', 'skipped'),
    ]
    expect(progressSummary({ steps, current: null })).toMatchObject({
      phase: 'failed',
      step: 2,
      total: 3,
      title: 'Failed at step 2 of 3 · Build',
    })
    expect(progressHeadline({ steps, current: null })).toBe('Failed at step 2 of 3 · Build')
  })

  it('reads done with the time it took, stopped, and getting ready', () => {
    const done = [
      step('build', 'Build', 'done', {
        startedAt: '2026-10-12T10:00:00Z',
        finishedAt: '2026-10-12T10:01:00Z',
      }),
      step('start', 'Start the app', 'done', {
        startedAt: '2026-10-12T10:01:00Z',
        finishedAt: '2026-10-12T10:03:12Z',
      }),
    ]
    expect(progressSummary({ steps: done, current: null })).toMatchObject({
      phase: 'done',
      step: 2,
      total: 2,
      title: 'All 2 steps done · 03:12',
    })
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'done'), step('start', 'Start the app', 'done')],
      })?.title
    ).toBe('All 2 steps done')
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'done'), step('start', 'Start the app', 'skipped')],
      })
    ).toMatchObject({ phase: 'stopped', step: 1, total: 2, title: 'Stopped after step 1 of 2' })
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'pending'), step('start', 'Start the app', 'pending')],
      })
    ).toMatchObject({ phase: 'waiting', step: 0, total: 2, title: 'Getting ready' })
  })

  it('has nothing to say when every step was already there', () => {
    expect(
      progressSummary({ steps: [step('install-docker', 'Install Docker', 'ready')], current: null })
    ).toBeNull()
    expect(progressHeadline({ steps: [], current: null })).toBeNull()
    expect(progressHeadline(null)).toBeNull()
  })
})

describe('progressChipLabel', () => {
  it('shows the running step only', () => {
    expect(progressChipLabel({ steps: FRESH_HOST, current: 'install-runtime:node-22' })).toBe(
      'Step 2 of 6 · Installing Node 22'
    )
    expect(progressChipLabel({ steps: [step('build', 'Build', 'done')], current: null })).toBeNull()
    expect(progressChipLabel(null)).toBeNull()
    expect(progressChipLabel(undefined)).toBeNull()
  })
})

describe('activityStepText', () => {
  it('uses the control plane counts and the running label', () => {
    expect(activityStepText({ step: 3, totalSteps: 7, stepLabel: 'Install Docker' })).toBe(
      'Step 3 of 7 · Installing Docker'
    )
    expect(activityStepText({ step: 3, totalSteps: 7, stepLabel: null })).toBe('Step 3 of 7')
    expect(activityStepText({ step: 3, totalSteps: 7 })).toBe('Step 3 of 7')
  })

  it('never says step 0', () => {
    expect(activityStepText({ step: 0, totalSteps: 7 })).toBe('Starting · 7 steps')
  })

  it('is empty for rows without a plan', () => {
    expect(activityStepText({ step: null, totalSteps: null })).toBeNull()
    expect(activityStepText({ step: 1, totalSteps: null })).toBeNull()
    expect(activityStepText({ step: 0, totalSteps: 0 })).toBeNull()
  })
})

describe('firstTimeSetupCaption', () => {
  const caption =
    'First-time setup on this server. Installing what the app needs; this can take a few minutes.'

  it('shows while an install step is still to run or running', () => {
    expect(firstTimeSetupCaption(FRESH_HOST)).toBe(caption)
    expect(firstTimeSetupCaption([step('install-php:8.3', 'Install PHP 8.3', 'pending')])).toBe(
      caption
    )
  })

  it('stays quiet when everything was already there, the installs are over, or nothing installs', () => {
    expect(
      firstTimeSetupCaption([
        step('install-docker', 'Install Docker', 'ready'),
        step('build', 'Build', 'running'),
      ])
    ).toBeNull()
    expect(
      firstTimeSetupCaption([
        step('install-docker', 'Install Docker', 'done'),
        step('build', 'Build', 'running'),
      ])
    ).toBeNull()
    expect(
      firstTimeSetupCaption([
        step('install-docker', 'Install Docker', 'failed'),
        step('build', 'Build', 'skipped'),
      ])
    ).toBeNull()
    expect(firstTimeSetupCaption([step('fetch', 'Fetch the code', 'pending')])).toBeNull()
  })
})

describe('elapsed time', () => {
  const now = Date.parse('2026-10-12T10:05:07.000Z')

  it('counts whole seconds since the step started, never below zero', () => {
    expect(elapsedSeconds('2026-10-12T10:03:00.000Z', now)).toBe(127)
    expect(elapsedSeconds('2026-10-12T10:05:06.400Z', now)).toBe(0)
    expect(elapsedSeconds('2026-10-12T10:06:00.000Z', now)).toBe(0)
  })

  it('is unknown without a readable start time', () => {
    expect(elapsedSeconds(null, now)).toBeNull()
    expect(elapsedSeconds(undefined, now)).toBeNull()
    expect(elapsedSeconds('yesterday', now)).toBeNull()
  })

  it('formats mm:ss and keeps counting minutes past an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(7)).toBe('00:07')
    expect(formatElapsed(127)).toBe('02:07')
    expect(formatElapsed(4325.9)).toBe('72:05')
    expect(formatElapsed(-3)).toBe('00:00')
  })

  it('measures the whole plan from the first start to the last finish', () => {
    expect(
      planElapsedSeconds([
        step('a', 'A', 'done', {
          startedAt: '2026-10-12T10:00:00Z',
          finishedAt: '2026-10-12T10:00:30Z',
        }),
        step('b', 'B', 'done', {
          startedAt: '2026-10-12T10:00:30Z',
          finishedAt: '2026-10-12T10:02:00Z',
        }),
        step('c', 'C', 'ready'),
      ])
    ).toBe(120)
    expect(
      planElapsedSeconds([
        step('a', 'A', 'done', { startedAt: 'bad', finishedAt: '2026-10-12T10:02:00Z' }),
      ])
    ).toBeNull()
    expect(planElapsedSeconds([step('a', 'A', 'done')])).toBeNull()
    expect(planElapsedSeconds(null)).toBeNull()
  })

  it('pads the counter to two digits', () => {
    expect(counterDigits(3)).toBe('03')
    expect(counterDigits(12)).toBe('12')
    expect(counterDigits(-1)).toBe('00')
  })
})

describe('step nodes', () => {
  it('pairs every state with a word, a glyph and a tone', () => {
    expect(stepNodeInfo('ready')).toMatchObject({
      word: 'already on this server',
      glyph: 'check',
      tone: 'ok',
    })
    expect(stepNodeInfo('done')).toMatchObject({ word: 'done', glyph: 'check', tone: 'ok' })
    expect(stepNodeInfo('running')).toMatchObject({
      word: 'in progress',
      glyph: 'spinner',
      tone: 'busy',
    })
    expect(stepNodeInfo('pending')).toMatchObject({
      word: 'not started',
      glyph: null,
      tone: 'idle',
    })
    expect(stepNodeInfo('failed')).toMatchObject({ word: 'failed', glyph: 'diamond', tone: 'bad' })
    expect(stepNodeInfo('skipped')).toMatchObject({
      word: 'skipped',
      glyph: 'dashed',
      tone: 'idle',
    })
  })

  it('reads an unknown state as not started', () => {
    expect(stepNodeInfo('surprise')).toEqual(stepNodeInfo('pending'))
  })

  it('tells a screen reader the position, the step and its state', () => {
    expect(stepAccessibilityLabel(FRESH_HOST, FRESH_HOST[2]!)).toBe(
      'Step 2 of 6, Install Node 22, in progress'
    )
    expect(stepAccessibilityLabel(FRESH_HOST, FRESH_HOST[1]!)).toBe(
      'Set up the web gateway, already on this server'
    )
  })
})

describe('liveProgressHeadline', () => {
  const plan = { steps: FRESH_HOST, current: 'install-runtime:node-22' }

  it('says the deploy waits for another build while the server reports it', () => {
    expect(liveProgressHeadline({ ...plan, runningSince: null }, false)).toBe(
      WAITING_FOR_BUILD_TEXT
    )
  })

  it('shows the step line once the deploy runs, on older servers and after the end', () => {
    expect(liveProgressHeadline({ ...plan, runningSince: '2026-10-26T10:00:00Z' }, false)).toBe(
      'Step 2 of 6 · Installing Node 22'
    )
    expect(liveProgressHeadline(plan, false)).toBe('Step 2 of 6 · Installing Node 22')
    expect(liveProgressHeadline({ ...plan, runningSince: null }, true)).toBe(
      'Step 2 of 6 · Installing Node 22'
    )
  })
})

describe('certificateStepNote', () => {
  // The payload the daemon sends once the certificates step is done: the step
  // keeps its note as `detail` (the daemon's `done(id, { note })`).
  const sent = {
    current: 'health',
    steps: [
      {
        id: 'start',
        label: 'Start the app',
        state: 'done' as const,
        startedAt: '2026-10-29T10:00:00.000Z',
        finishedAt: '2026-10-29T10:00:05.000Z',
      },
      {
        id: 'certificates',
        label: 'Set up certificates',
        state: 'done' as const,
        startedAt: '2026-10-29T10:00:05.000Z',
        finishedAt: '2026-10-29T10:00:06.000Z',
        detail: 'Requested in the background; the Certificate panel shows progress: a.example.com',
      },
      {
        id: 'health',
        label: 'Check it answers',
        state: 'running' as const,
        startedAt: '2026-10-29T10:00:06.000Z',
      },
    ],
  }

  it('shows the line the finished certificates step kept', () => {
    expect(certificateStepNote(stepsOf(sent))).toBe(
      'Requested in the background; the Certificate panel shows progress: a.example.com'
    )
  })

  it('shows nothing while the step runs, or when it kept no line', () => {
    const running = sent.steps.map((step) =>
      step.id === 'certificates' ? { ...step, state: 'running' as const } : step
    )
    expect(certificateStepNote(running)).toBeNull()
    const silent = sent.steps.map(({ detail: _detail, ...step }) => step)
    expect(certificateStepNote(silent)).toBeNull()
    expect(certificateStepNote(undefined)).toBeNull()
  })
})
