// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { fontFamily } from '@/lib/v4/typography'
import type { CommandProgress, CommandProgressStep, CommandProgressStepState } from '@/lib/instance-api'
import { DeployProgressRail } from './deploy-progress-rail'

const motion = vi.hoisted(() => ({ reduce: false }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('react-native-reanimated', async () => {
  const { flatten } = await import('@/components/ui/v4/rn-stub')
  const AnimatedView = (props: Readonly<{ children?: ReactNode; style?: unknown }>) =>
    createElement('div', { 'data-animated': 'yes', 'data-style': JSON.stringify(flatten(props.style)) }, props.children)
  return {
    default: { View: AnimatedView },
    Easing: { inOut: (fn: unknown) => fn, sin: 'sin' },
    cancelAnimation: () => {},
    interpolate: (value: number) => value,
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useReducedMotion: () => motion.reduce,
    useSharedValue: (value: unknown) => ({ value }),
    withRepeat: (value: unknown) => value,
    withTiming: (value: unknown) => value,
  }
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  motion.reduce = false
})

function step(
  id: string,
  label: string,
  state: CommandProgressStepState,
  extra?: Partial<CommandProgressStep>,
): CommandProgressStep {
  return { id, label, state, ...extra }
}

function progress(steps: CommandProgressStep[], current: string | null = null): CommandProgress {
  return { version: 1, steps, current, updatedAt: '2026-10-12T10:00:00.000Z' }
}

const EVERY_STATE = progress(
  [
    step('install-gateway', 'Set up the web gateway', 'ready'),
    step('install-docker', 'Install Docker', 'done'),
    step('install-runtime:node-22', 'Install Node 22', 'running', {
      startedAt: '2026-10-12T10:03:00.000Z',
      detail: 'Unpack the archive',
    }),
    step('fetch', 'Fetch the code', 'pending'),
    step('build', 'Build', 'failed'),
    step('start', 'Start the app', 'skipped'),
  ],
  'install-runtime:node-22',
)

/** The drawn node inside a rail item: the one box with a hairline border. */
function nodeOf(item: HTMLElement): HTMLElement {
  const node = [...item.querySelectorAll('div')].find((el) => styleOf(el).borderWidth === 1)
  if (!node) throw new Error('no node drawn')
  return node
}

/** The `Animated.View` halos: absolutely placed divs behind a node. */
function halos(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[data-animated]')].filter(
    (el) => styleOf(el).position === 'absolute',
  )
}

describe.each(SCENARIOS)('DeployProgressRail ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('draws nothing without a plan', () => {
    const { container, rerender } = render(<DeployProgressRail progress={null} />)
    expect(container.textContent).toBe('')
    rerender(<DeployProgressRail progress={undefined} />)
    expect(container.textContent).toBe('')
    rerender(<DeployProgressRail progress={progress([])} />)
    expect(container.textContent).toBe('')
  })

  it.each([
    ['Set up the web gateway: already there', 'path', 'ok'],
    ['Install Docker: done', 'path', 'ok'],
    ['Install Node 22: in progress', 'path', 'busy'],
    ['Fetch the code: not started', null, 'idle'],
    ['Build: failed', 'path', 'bad'],
    ['Start the app: skipped', 'circle', 'idle'],
  ] as const)('names %s as a word with its glyph and tone', (name, shape, tone) => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    const item = screen.getByLabelText(name)
    const drawn = item.querySelector('svg')
    if (shape === null) {
      expect(drawn).toBeNull()
    } else {
      expect(drawn?.querySelector(shape)).not.toBeNull()
    }
    const node = nodeOf(item)
    if (tone !== 'idle') expect(styleOf(node).borderColor).toBe(token(scenario, tone))
    expect(styleOf(node).borderRadius).toBe(9)
  })

  it('shows the failed and skipped words beside the label, not only the mark', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(screen.getByText('Build · failed')).toBeTruthy()
    expect(screen.getByText('Start the app · skipped')).toBeTruthy()
    expect(screen.getByText('Install Docker')).toBeTruthy()
  })

  it('fills the track after a ticked step and leaves it empty after the rest', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    const fills = [...document.querySelectorAll('[data-animated]')]
      .filter((el) => styleOf(el).position !== 'absolute')
      .map((el) => styleOf(el).width)
    expect(fills).toEqual(['100%', '100%', '0%', '0%', '0%'])
    const [fill] = document.querySelectorAll('[data-animated]')
    expect(styleOf(fill).backgroundColor).toBe(token(scenario, 'ok'))
  })

  it('reads the step count in the body face, the task in the mono face and the first-time caption', () => {
    render(<DeployProgressRail progress={EVERY_STATE} />)
    const headline = screen.getByText('Step 2 of 5 · Installing Node 22')
    expect(styleOf(headline).fontFamily).toBe(fontFamily('bodyMedium', scenario.os === 'web'))
    const detail = screen.getByText('Unpack the archive')
    expect(styleOf(detail).fontFamily).toBe(fontFamily('mono', scenario.os === 'web'))
    expect(
      screen.getByText(
        'First-time setup on this server. Installing what the app needs; this can take a few minutes.',
      ),
    ).toBeTruthy()
  })

  it('pulses the running node only, and not under reduced motion', () => {
    const { container, unmount } = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(halos(container)).toHaveLength(1)
    expect(styleOf(halos(container)[0]).backgroundColor).toBe(token(scenario, 'busy'))
    unmount()
    motion.reduce = true
    const reduced = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(halos(reduced.container)).toHaveLength(0)
    expect(screen.getByLabelText('Install Node 22: in progress')).toBeTruthy()
  })

  it('times the running step in mm:ss and stops when nothing runs', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T10:03:07.000Z'))
    const { rerender } = render(<DeployProgressRail progress={EVERY_STATE} />)
    expect(screen.getByText('00:07')).toBeTruthy()
    expect(styleOf(screen.getByText('00:07')).fontFamily).toBe(fontFamily('monoMedium', scenario.os === 'web'))
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('01:07')).toBeTruthy()
    rerender(
      <DeployProgressRail
        progress={progress([step('build', 'Build', 'done'), step('start', 'Start the app', 'done')])}
      />,
    )
    expect(screen.queryByText(/^\d\d:\d\d$/)).toBeNull()
    expect(screen.getByText('All 2 steps done')).toBeTruthy()
  })

  it('ticks every step and drops the caption once the deploy succeeded', () => {
    render(
      <DeployProgressRail
        progress={progress([
          step('install-docker', 'Install Docker', 'done'),
          step('build', 'Build', 'done'),
        ])}
      />,
    )
    expect(screen.getByLabelText('Install Docker: done').querySelector('path')).not.toBeNull()
    expect(screen.getByLabelText('Build: done').querySelector('path')).not.toBeNull()
    expect(screen.queryByText(/First-time setup/)).toBeNull()
  })

  it('names the failed step when the deploy stopped', () => {
    render(
      <DeployProgressRail
        progress={progress([
          step('fetch', 'Fetch the code', 'done'),
          step('build', 'Build', 'failed'),
          step('start', 'Start the app', 'skipped'),
        ])}
      />,
    )
    expect(screen.getByText('Step 2 of 3 · Build failed')).toBeTruthy()
    expect(styleOf(nodeOf(screen.getByLabelText('Build: failed'))).borderColor).toBe(token(scenario, 'bad'))
  })
})
