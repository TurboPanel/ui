import { describe, expect, it } from 'vitest'
import { stepRailFocus } from '@/lib/step-rail'
import {
  activityStepText,
  progressCounterText,
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
  stepCounts,
  stepPosition,
  stepTimeText,
  stepTitle,
  healthStepNote,
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
  step('install-gateway', 'Set Up the Web Gateway', 'ready'),
  step('install-runtime:node-22', 'Install Node 22', 'running', { detail: 'Unpack the archive' }),
  step('fetch', 'Fetch the Source Code', 'pending'),
  step('build', 'Build', 'pending'),
  step('start', 'Start the App', 'pending'),
  step('health', 'Check Service Health', 'pending'),
]

describe('gerundLabel', () => {
  it.each([
    ['Install Docker', 'Installing Docker'],
    ['Fetch the Source Code', 'Fetching the Source Code'],
    ['Build', 'Building'],
    ['Start the App', 'Starting the App'],
    ['Check Service Health', 'Checking Service Health'],
    ['Set Up Certificates', 'Setting Up Certificates'],
    ['Install PHP 8.3', 'Installing PHP 8.3'],
    ['Start the New Release', 'Starting the New Release'],
    ['Switch Traffic', 'Switching Traffic'],
    ['Stop the Old Release', 'Stopping the Old Release'],
  ])('turns %s into %s', (label, expected) => {
    expect(gerundLabel(label)).toBe(expected)
  })

  it("shows an older daemon's wording as the current title", () => {
    expect(gerundLabel('Check it answers')).toBe('Checking Service Health')
    expect(gerundLabel('Set up certificates')).toBe('Setting Up Certificates')
    expect(stepTitle('Fetch the code')).toBe('Fetch the Source Code')
    expect(stepTitle('Install nginx')).toBe('Install nginx')
    expect(stepTitle('  Build ')).toBe('Build')
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
    expect(stepCounts(undefined, step('x', 'X', 'pending'))).toEqual({ position: 0, total: 0 })
    expect(runningStep({ steps: 7 as unknown as [], current: 'x' })).toBeNull()
    expect(failedStep(null)).toBeNull()
    expect(firstTimeSetupCaption(undefined)).toBeNull()
    expect(progressSummary({ steps: {} })).toBeNull()
  })

  it('counts every listed step, already-there ones included, in list order', () => {
    expect(stepCounts(FRESH_HOST, FRESH_HOST[0]!).total).toBe(7)
    expect(stepPosition(FRESH_HOST, FRESH_HOST[2]!)).toBe(3)
    expect(stepPosition(FRESH_HOST, FRESH_HOST[1]!)).toBe(2)
    expect(stepCounts(FRESH_HOST, FRESH_HOST[4]!)).toEqual({ position: 5, total: 7 })
    expect(stepCounts(FRESH_HOST, step('other', 'Other', 'pending'))).toEqual({
      position: 0,
      total: 7,
    })
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
      step: 3,
      total: 7,
      title: 'Installing Node 22',
      focus: FRESH_HOST[2],
    })
    expect(progressHeadline({ steps: FRESH_HOST, current: 'install-runtime:node-22' })).toBe(
      'Step 3 of 7 · Installing Node 22'
    )
  })

  it('names the step that failed', () => {
    const steps = [
      step('install-docker', 'Install Docker', 'done'),
      step('build', 'Build', 'failed'),
      step('start', 'Start the App', 'skipped'),
    ]
    expect(progressSummary({ steps, current: null })).toMatchObject({
      phase: 'failed',
      step: 2,
      total: 3,
      title: 'Failed at Step 2 of 3 · Build',
    })
    expect(progressHeadline({ steps, current: null })).toBe('Failed at Step 2 of 3 · Build')
  })

  it('reads done with the time it took, stopped, and getting ready', () => {
    const done = [
      step('build', 'Build', 'done', {
        startedAt: '2026-10-12T10:00:00Z',
        finishedAt: '2026-10-12T10:01:00Z',
      }),
      step('start', 'Start the App', 'done', {
        startedAt: '2026-10-12T10:01:00Z',
        finishedAt: '2026-10-12T10:03:12Z',
      }),
    ]
    expect(progressSummary({ steps: done, current: null })).toMatchObject({
      phase: 'done',
      step: 2,
      total: 2,
      title: 'All 2 Steps Done · 03:12',
    })
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'done'), step('start', 'Start the App', 'done')],
      })?.title
    ).toBe('All 2 Steps Done')
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'done'), step('start', 'Start the App', 'skipped')],
      })
    ).toMatchObject({ phase: 'stopped', step: 1, total: 2, title: 'Stopped After Step 1 of 2' })
    expect(
      progressSummary({
        steps: [step('build', 'Build', 'pending'), step('start', 'Start the App', 'pending')],
      })
    ).toMatchObject({ phase: 'waiting', step: 0, total: 2, title: 'Getting Ready' })
  })

  it('uses one position and total for the header, failure, stopped and spoken labels', () => {
    const lead = [
      step('install-docker', 'Install Docker', 'ready'),
      step('install-gateway', 'Set Up the Web Gateway', 'ready'),
      step('fetch', 'Fetch the Source Code', 'done'),
    ]
    const running = [...lead, step('build', 'Build', 'running'), step('start', 'Start', 'pending')]
    expect(progressHeadline({ steps: running, current: 'build' })).toBe('Step 4 of 5 · Building')
    expect(stepAccessibilityLabel(running, running[3]!)).toBe('Step 4 of 5, Build, in progress')
    const failed = [...lead, step('build', 'Build', 'failed'), step('start', 'Start', 'skipped')]
    expect(progressHeadline({ steps: failed, current: null })).toBe('Failed at Step 4 of 5 · Build')
    expect(stepAccessibilityLabel(failed, failed[3]!)).toBe('Step 4 of 5, Build, failed')
    const stopped = [...lead, step('build', 'Build', 'skipped'), step('start', 'Start', 'skipped')]
    expect(progressSummary({ steps: stopped, current: null })).toMatchObject({
      phase: 'stopped',
      step: 3,
      total: 5,
      title: 'Stopped After Step 3 of 5',
    })
    const waiting = [
      step('install-docker', 'Install Docker', 'ready'),
      step('build', 'Build', 'pending'),
    ]
    expect(progressSummary({ steps: waiting, current: null })).toMatchObject({
      phase: 'waiting',
      step: 0,
      total: 2,
    })
  })

  it('keeps the stopped wording consistent and counts a skipped step before a done one', () => {
    expect(progressSummary({ steps: [step('a', 'A', 'skipped')], current: null })?.title).toBe(
      'Stopped Before the First Step'
    )
    const mixed = [
      step('a', 'A', 'done'),
      step('b', 'B', 'skipped'),
      step('c', 'C', 'done'),
      step('d', 'D', 'skipped'),
    ]
    expect(progressSummary({ steps: mixed, current: null })).toMatchObject({
      phase: 'stopped',
      step: 1,
      total: 4,
      title: 'Stopped After Step 1 of 4',
    })
  })

  it('picks the same step for the phone short form as for the header', () => {
    const summary = progressSummary({ steps: FRESH_HOST, current: null })
    const focus = stepRailFocus(FRESH_HOST.map((entry) => ({ state: entry.state })))
    expect(focus?.index).toBe(summary!.step - 1)
  })

  it('keeps the position as the list index while the list grows between polls', () => {
    const first = [step('a', 'A', 'done'), step('b', 'B', 'running'), step('c', 'C', 'pending')]
    expect(progressHeadline({ steps: first, current: 'b' })).toBe('Step 2 of 3 · B')
    const grown = [
      step('a', 'A', 'done'),
      step('b', 'B', 'running'),
      step('c', 'C', 'pending'),
      step('d', 'D', 'pending'),
      step('e', 'E', 'pending'),
    ]
    expect(progressHeadline({ steps: grown, current: 'b' })).toBe('Step 2 of 5 · B')
    expect(stepAccessibilityLabel(grown, grown[1]!)).toBe('Step 2 of 5, B, in progress')
  })

  it('reads a plan whose steps were all already there as done', () => {
    expect(
      progressSummary({ steps: [step('install-docker', 'Install Docker', 'ready')], current: null })
    ).toMatchObject({ phase: 'done', step: 1, total: 1 })
    expect(progressHeadline({ steps: [], current: null })).toBeNull()
    expect(progressHeadline(null)).toBeNull()
  })
})

describe('progressChipLabel', () => {
  it('shows the running step only', () => {
    expect(progressChipLabel({ steps: FRESH_HOST, current: 'install-runtime:node-22' })).toBe(
      'Step 3 of 7 · Installing Node 22'
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
    expect(firstTimeSetupCaption([step('fetch', 'Fetch the Source Code', 'pending')])).toBeNull()
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

  it('words the rail counter like the header, with no padding and no zero', () => {
    expect(progressCounterText({ phase: 'running', step: 4, total: 8 })).toBe('Step 4 of 8')
    expect(progressCounterText({ phase: 'waiting', step: 0, total: 8 })).toBe('Step -- of 8')
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
      'Step 3 of 7, Install Node 22, in progress'
    )
    expect(stepAccessibilityLabel(FRESH_HOST, FRESH_HOST[1]!)).toBe(
      'Step 2 of 7, Set Up the Web Gateway, already on this server'
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
      'Step 3 of 7 · Installing Node 22'
    )
    expect(liveProgressHeadline(plan, false)).toBe('Step 3 of 7 · Installing Node 22')
    expect(liveProgressHeadline({ ...plan, runningSince: null }, true)).toBe(
      'Step 3 of 7 · Installing Node 22'
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
        label: 'Start the App',
        state: 'done' as const,
        startedAt: '2026-10-29T10:00:00.000Z',
        finishedAt: '2026-10-29T10:00:05.000Z',
      },
      {
        id: 'certificates',
        label: 'Set Up Certificates',
        state: 'done' as const,
        startedAt: '2026-10-29T10:00:05.000Z',
        finishedAt: '2026-10-29T10:00:06.000Z',
        detail: 'Requested in the background; the Certificate panel shows progress: a.example.com',
      },
      {
        id: 'health',
        label: 'Check Service Health',
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

describe('healthStepNote', () => {
  const health = (state: CommandProgressStepState, detail?: string) =>
    step('health', 'Service Is Healthy', state, detail ? { detail } : undefined)

  it('is the line the health step left once it ended', () => {
    expect(healthStepNote([health('done', ' Healthy after 12 s ')])).toBe('Healthy after 12 s')
    expect(healthStepNote([health('failed', 'Did not become healthy within 120 s')])).toBe(
      'Did not become healthy within 120 s'
    )
  })

  it('adds the time the service first answered', () => {
    const finishedAt = '2026-10-12T10:00:12.000Z'
    const note = healthStepNote([
      {
        id: 'health',
        label: 'Service Is Healthy',
        state: 'done',
        detail: 'Healthy after 12 s',
        finishedAt,
      },
    ])
    expect(note).toBe(`Healthy after 12 s (at ${new Date(finishedAt).toLocaleTimeString()})`)
  })

  it('is null while the step runs, when it said nothing, or without a plan', () => {
    expect(healthStepNote([health('running', 'Attempt 2, 4 s of up to 120 s')])).toBeNull()
    expect(healthStepNote([health('done')])).toBeNull()
    expect(healthStepNote(null)).toBeNull()
  })
})

describe('stepTimeText', () => {
  const NOW = Date.parse('2026-10-12T10:05:00Z')

  it('counts a running step up to now and keeps start to finish on a finished one', () => {
    expect(
      stepTimeText(step('build', 'Build', 'running', { startedAt: '2026-10-12T10:03:48Z' }), NOW)
    ).toBe('01:12')
    expect(
      stepTimeText(
        step('build', 'Build', 'done', {
          startedAt: '2026-10-12T10:00:00Z',
          finishedAt: '2026-10-12T10:01:12Z',
        }),
        NOW
      )
    ).toBe('01:12')
    expect(
      stepTimeText(
        step('start', 'Start', 'failed', {
          startedAt: '2026-10-12T10:00:00Z',
          finishedAt: '2026-10-12T10:00:09Z',
        }),
        NOW
      )
    ).toBe('00:09')
  })

  it('shows nothing for steps that did not run or lack times', () => {
    const times = { startedAt: '2026-10-12T10:00:00Z', finishedAt: '2026-10-12T10:01:00Z' }
    expect(stepTimeText(step('a', 'A', 'ready'), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'ready', times), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'pending'), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'skipped', times), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'running'), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'done'), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'done', { startedAt: times.startedAt }), NOW)).toBeNull()
    expect(stepTimeText(step('a', 'A', 'failed', { finishedAt: times.finishedAt }), NOW)).toBeNull()
    expect(
      stepTimeText(step('a', 'A', 'done', { startedAt: 'nope', finishedAt: times.finishedAt }), NOW)
    ).toBeNull()
  })

  it('adds the time to the spoken label', () => {
    const steps = [step('build', 'Build', 'done')]
    expect(stepAccessibilityLabel(steps, steps[0]!, '01:12')).toBe(
      'Step 1 of 1, Build, done, 01:12'
    )
  })
})
