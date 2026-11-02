// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { fontFamily } from '@/lib/v4/typography'
import type {
  CommandProgress,
  CommandProgressStep,
  CommandProgressStepState,
} from '@/lib/instance-api'
import { DeployProgressRail } from './deploy-progress-rail'

const motion = vi.hoisted(() => ({
  reduce: false,
  timing: vi.fn((value: unknown) => value),
  repeat: vi.fn((value: unknown) => value),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('react-native-reanimated', async () => {
  const { flatten } = await import('@/components/ui/v4/rn-stub')
  const AnimatedView = (props: Readonly<{ children?: ReactNode; style?: unknown }>) =>
    createElement(
      'div',
      { 'data-animated': 'yes', 'data-style': JSON.stringify(flatten(props.style)) },
      props.children
    )
  return {
    default: { View: AnimatedView },
    Easing: { inOut: (fn: unknown) => fn, sin: 'sin', linear: 'linear', steps: () => 'steps' },
    cancelAnimation: () => {},
    interpolate: (value: number) => value,
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: () => motion.reduce,
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: motion.repeat,
    withTiming: motion.timing,
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  motion.reduce = false
  motion.timing.mockClear()
  motion.repeat.mockClear()
})

function step(
  id: string,
  label: string,
  state: CommandProgressStepState,
  extra?: Partial<CommandProgressStep>
): CommandProgressStep {
  return { id, label, state, ...extra }
}

function progress(steps: CommandProgressStep[], current: string | null = null): CommandProgress {
  return { version: 1, steps, current, updatedAt: '2026-10-12T10:00:00.000Z' }
}

const EVERY_STATE = progress(
  [
    step('install-gateway', 'Set Up the Web Gateway', 'ready'),
    step('install-docker', 'Install Docker', 'done'),
    step('install-runtime:node-22', 'Install Node 22', 'running', {
      startedAt: '2026-10-12T10:03:00.000Z',
      detail: 'Unpack the archive',
    }),
    step('fetch', 'Fetch the Source Code', 'pending'),
    step('build', 'Build', 'failed'),
    step('start', 'Start the App', 'skipped'),
  ],
  'install-runtime:node-22'
)

/** The drawn node inside a rail segment: the one box with a hairline border and a radius of 7. */
function nodeOf(item: HTMLElement): HTMLElement {
  const node = [...item.querySelectorAll('div')].find(
    (el) => styleOf(el).borderRadius === 7 && styleOf(el).borderWidth === 1
  )
  if (!node) throw new Error('no node drawn')
  return node
}

/** Animated views by what they are: a halo is absolute and round, a fill is absolute with a width. */
function animated(container: ParentNode): {
  halos: Element[]
  fills: Element[]
  sweeps: Element[]
} {
  const all = [...container.querySelectorAll('[data-animated]')]
  return {
    halos: all.filter((el) => styleOf(el).borderRadius === 7),
    fills: all.filter((el) => styleOf(el).left === 0 && typeof styleOf(el).width === 'string'),
    sweeps: all.filter((el) => styleOf(el).width === '40%'),
  }
}

describe.each(SCENARIOS)('DeployProgressRail ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('draws nothing without a plan, or with a broken one', () => {
    const { container, rerender } = render(<DeployProgressRail progress={null} />)
    expect(container.textContent).toBe('')
    rerender(<DeployProgressRail progress={undefined} />)
    expect(container.textContent).toBe('')
    rerender(<DeployProgressRail progress={progress([])} />)
    expect(container.textContent).toBe('')
    rerender(
      <DeployProgressRail
        progress={{ version: 1, steps: 'oops' as unknown as [], current: null, updatedAt: '' }}
      />
    )
    expect(container.textContent).toBe('')
  })

  it.each([
    ['Set Up the Web Gateway, already on this server', 'path', 'ok', 'okLine'],
    ['Step 1 of 5, Install Docker, done', 'path', 'ok', 'ok'],
    ['Step 2 of 5, Install Node 22, in progress', 'path', 'busy', 'busyLine'],
    ['Step 3 of 5, Fetch the Source Code, not started', null, 'sepStrong', null],
    ['Step 4 of 5, Build, failed', 'path', 'bad', 'bad'],
    ['Step 5 of 5, Start the App, skipped', 'circle', 'sep', null],
  ] as const)(
    'reads %s to a screen reader, with its glyph, node tone and segment fill',
    (name, shape, border, fill) => {
      render(<DeployProgressRail progress={EVERY_STATE} />)
      const segment = screen.getByRole('listitem', { name })
      const drawn = segment.querySelector('svg')
      if (shape === null) {
        expect(drawn).toBeNull()
      } else {
        expect(drawn?.querySelector(shape)).not.toBeNull()
      }
      expect(styleOf(nodeOf(segment)).borderColor).toBe(token(scenario, border))
      const fills = animated(segment).fills
      if (fill === null) {
        expect(fills).toHaveLength(0)
      } else {
        expect(styleOf(fills[0]).backgroundColor).toBe(token(scenario, fill))
      }
    }
  )

  it('is one full-width track of equal segments with an end cap', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    const track = screen.getByRole('list')
    expect(styleOf(track).width).toBe('100%')
    const segments = screen.getAllByRole('listitem')
    expect(segments).toHaveLength(6)
    expect(segments[1]?.getAttribute('aria-label')).toBe('Step 1 of 5, Install Docker, done')
    for (const segment of segments) {
      expect(segment.parentElement).toBe(track)
      expect(styleOf(segment).flex).toBe(1)
    }
    const cap = track.lastElementChild as HTMLElement
    expect(styleOf(cap).borderColor).toBe(token(scenario, 'sepStrong'))
  })

  it('shows the counter in mono small caps, the step name in the body face and the task in mono with a caret', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    const counter = screen.getByText('Step 02 / 05')
    expect(styleOf(counter).fontFamily).toBe(fontFamily('monoSemibold', scenario.os === 'web'))
    expect(styleOf(counter).textTransform).toBe('uppercase')
    expect(styleOf(counter).letterSpacing).toBe(0.5)
    expect(styleOf(counter).fontVariant).toEqual(['tabular-nums'])
    expect(styleOf(counter).color).toBe(token(scenario, 'busy'))
    expect(counter.getAttribute('aria-label')).toBe('Step 2 of 5')
    const title = screen.getByText('Installing Node 22')
    expect(styleOf(title).fontFamily).toBe(fontFamily('bodyMedium', scenario.os === 'web'))
    const detail = screen.getByText('Unpack the archive')
    expect(styleOf(detail).fontFamily).toBe(fontFamily('mono', scenario.os === 'web'))
    const caret = detail.nextElementSibling as HTMLElement
    expect(caret.getAttribute('data-animated')).toBe('yes')
    expect(styleOf(caret).backgroundColor).toBe(token(scenario, 'busy'))
    expect(
      screen.getByText(
        'First-time setup on this server. Installing what the app needs; this can take a few minutes.'
      )
    ).toBeTruthy()
  })

  it('labels every node under the track on a wide screen', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(screen.getByText('Build · failed')).toBeTruthy()
    expect(screen.getByText('Start the App · skipped')).toBeTruthy()
    expect(screen.getByText('Install Docker')).toBeTruthy()
    expect(screen.queryByText('in progress')).toBeNull()
  })

  it('lists the steps as a checklist with the state word at phone width', () => {
    env.width = 390
    render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(styleOf(screen.getByRole('list')).width).toBe('100%')
    expect(screen.getByText('in progress')).toBeTruthy()
    expect(styleOf(screen.getByText('Install Node 22')).flexShrink).toBe(1)
    expect(screen.getByText('already on this server')).toBeTruthy()
    expect(screen.getByText('not started')).toBeTruthy()
    expect(screen.getByText('Build')).toBeTruthy()
    expect(screen.queryByText('Build · failed')).toBeNull()
  })

  it('pulses and sweeps the running step, animating fills, but not under reduced motion', () => {
    const { container, unmount } = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(animated(container).halos).toHaveLength(1)
    expect(styleOf(animated(container).halos[0]).backgroundColor).toBe(token(scenario, 'busy'))
    expect(animated(container).sweeps).toHaveLength(1)
    expect(motion.repeat).toHaveBeenCalled()
    expect(motion.timing).toHaveBeenCalledWith(100, { duration: 200 })
    unmount()
    motion.timing.mockClear()
    motion.repeat.mockClear()

    motion.reduce = true
    const reduced = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(animated(reduced.container).halos).toHaveLength(0)
    expect(animated(reduced.container).sweeps).toHaveLength(0)
    expect(motion.repeat).not.toHaveBeenCalled()
    expect(motion.timing).not.toHaveBeenCalled()
    const fills = animated(reduced.container).fills
    expect(fills.length).toBeGreaterThan(0)
    for (const fill of fills) expect(styleOf(fill).width).toBe('100%')
    const runningFill = animated(screen.getByLabelText('Step 2 of 5, Install Node 22, in progress'))
      .fills[0]
    expect(styleOf(runningFill).backgroundColor).toBe(token(scenario, 'busy'))
    const caret = screen.getByText('Unpack the archive').nextElementSibling as HTMLElement
    expect(styleOf(caret).opacity).toBe(1)
  })

  it('times the running step in mm:ss, stops when nothing runs, and needs a start time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T10:03:07.000Z'))
    const { rerender } = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(screen.getByText('00:07')).toBeTruthy()
    expect(styleOf(screen.getByText('00:07')).fontFamily).toBe(
      fontFamily('monoMedium', scenario.os === 'web')
    )
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('01:07')).toBeTruthy()
    rerender(
      <DeployProgressRail progress={progress([step('build', 'Build', 'running')], 'build')} />
    )
    expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull()
    rerender(
      <DeployProgressRail
        progress={progress([
          step('build', 'Build', 'done'),
          step('start', 'Start the App', 'done'),
        ])}
      />
    )
    expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull()
    expect(screen.getByText('All 2 Steps Done')).toBeTruthy()
  })

  it('never counts step zero while the plan is getting ready', () => {
    render(
      <DeployProgressRail
        progress={progress([
          step('fetch', 'Fetch the Source Code', 'pending'),
          step('build', 'Build', 'pending'),
        ])}
      />
    )
    const counter = screen.getByText('Step -- / 02')
    expect(counter.getAttribute('aria-label')).toBe('Getting Ready, 2 steps')
    expect(screen.getByText('Getting Ready')).toBeTruthy()
    expect(screen.queryByText(/00 \//)).toBeNull()
  })

  it('ends green with the time it took and no caption once the deploy succeeded', () => {
    const { container } = render(
      <DeployProgressRail
        progress={progress([
          step('install-docker', 'Install Docker', 'done', {
            startedAt: '2026-10-12T10:00:00Z',
            finishedAt: '2026-10-12T10:02:00Z',
          }),
          step('build', 'Build', 'done', {
            startedAt: '2026-10-12T10:02:00Z',
            finishedAt: '2026-10-12T10:03:12Z',
          }),
        ])}
      />
    )
    expect(screen.getByText('All 2 Steps Done · 03:12')).toBeTruthy()
    expect(styleOf(screen.getByText('Step 02 / 02')).color).toBe(token(scenario, 'ok'))
    for (const fill of animated(container).fills)
      expect(styleOf(fill).backgroundColor).toBe(token(scenario, 'ok'))
    const cap = screen.getByRole('list').lastElementChild as HTMLElement
    expect(styleOf(cap).backgroundColor).toBe(token(scenario, 'ok'))
    expect(screen.queryByText(/First-time setup/)).toBeNull()
  })

  it('names the failed step and paints its segment red', () => {
    render(
      <DeployProgressRail
        progress={progress([
          step('fetch', 'Fetch the Source Code', 'done'),
          step('build', 'Build', 'failed'),
          step('start', 'Start the App', 'skipped'),
        ])}
      />
    )
    expect(screen.getByText('Failed at Step 2 of 3 · Build')).toBeTruthy()
    expect(styleOf(screen.getByText('Step 02 / 03')).color).toBe(token(scenario, 'bad'))
    const failed = screen.getByLabelText('Step 2 of 3, Build, failed')
    expect(styleOf(nodeOf(failed)).borderColor).toBe(token(scenario, 'bad'))
    expect(styleOf(animated(failed).fills[0]).backgroundColor).toBe(token(scenario, 'bad'))
  })
  describe('the health step', () => {
    it('shows the result title and how long the service took once the step ended', () => {
      render(
        <DeployProgressRail
          progress={progress(
            [
              step('build', 'Build', 'done'),
              {
                id: 'health',
                label: 'Service Is Healthy',
                state: 'done',
                detail: 'Healthy after 12 s',
              },
            ],
            null
          )}
        />
      )
      expect(screen.getByText('Healthy after 12 s')).toBeTruthy()
      expect(screen.getAllByText('Service Is Healthy').length).toBeGreaterThan(0)
    })

    it("shows an older daemon's step wording in the current title case", () => {
      render(
        <DeployProgressRail
          progress={progress([step('health', 'Check it answers', 'pending')], null)}
        />
      )
      expect(screen.getAllByText('Check Service Health').length).toBeGreaterThan(0)
      expect(screen.queryByText('Check it answers')).toBeNull()
    })
  })

  describe('checking with the server', () => {
    const LOST = '2026-10-12T10:05:00.000Z'
    const withLost = (
      steps: CommandProgressStep[],
      contactLostAt?: string | null
    ): CommandProgress => ({
      ...progress(steps, 'build'),
      ...(contactLostAt === undefined ? {} : { contactLostAt }),
    })
    const running = [
      step('fetch', 'Fetch the Source Code', 'done'),
      step('build', 'Build', 'running'),
    ]

    it('shows the label, the plain explanation and the last known step while contact is lost', () => {
      render(<DeployProgressRail progress={withLost(running, LOST)} />)
      expect(screen.getByText('Checking with the Server')).toBeTruthy()
      expect(screen.getByText(/The deploy has not failed\./)).toBeTruthy()
      expect(screen.getByText(/Lost contact with the server during the deploy\./)).toBeTruthy()
      expect(screen.getByText('Building')).toBeTruthy()
      expect(screen.getByLabelText('Step 2 of 2, Build, in progress')).toBeTruthy()
    })

    it('shows nothing extra when the field is absent or null', () => {
      render(<DeployProgressRail progress={withLost(running)} />)
      expect(screen.queryByText('Checking with the Server')).toBeNull()
      cleanup()
      render(<DeployProgressRail progress={withLost(running, null)} />)
      expect(screen.queryByText('Checking with the Server')).toBeNull()
    })

    it('shows nothing once the deploy has ended, even if the field is left over', () => {
      render(
        <DeployProgressRail
          progress={withLost(
            [step('fetch', 'Fetch the Source Code', 'done'), step('build', 'Build', 'done')],
            LOST
          )}
        />
      )
      expect(screen.queryByText('Checking with the Server')).toBeNull()
      cleanup()
      render(
        <DeployProgressRail
          progress={withLost(
            [step('fetch', 'Fetch the Source Code', 'done'), step('build', 'Build', 'failed')],
            LOST
          )}
        />
      )
      expect(screen.queryByText('Checking with the Server')).toBeNull()
    })
  })
})
