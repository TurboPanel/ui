// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { WizardSteps } from '@/components/ui/wizard-steps'
import type { StepRailItem, StepRailState } from '@/lib/step-rail'
import { StepRail } from './step-rail'

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
    Easing: {
      inOut: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      back: () => 'back',
      cubic: 'cubic',
      sin: 'sin',
      linear: 'linear',
    },
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
  motion.reduce = false
  motion.timing.mockClear()
  motion.repeat.mockClear()
})

function steps(...list: StepRailState[]): StepRailItem[] {
  const labels = ['Name', 'Install Command', 'Run the Installer', 'Enroll', 'Connect', 'Ready']
  return list.map((state, index) => ({
    id: `s${index}`,
    label: labels[index] ?? `S${index}`,
    state,
  }))
}

/** The round node of a step: the box with a hairline border. */
function nodeOf(item: Element): HTMLElement {
  const node = [...item.querySelectorAll('div')].find((el) => styleOf(el).borderWidth === 1)
  if (!node) throw new Error('no node drawn')
  return node
}

function animatedIn(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-animated]')]
}

function spinsIn(container: ParentNode): HTMLElement[] {
  return animatedIn(container).filter((el) => {
    const transform = styleOf(el).transform as { rotate?: string }[] | undefined
    return transform?.some((part) => part.rotate !== undefined) ?? false
  })
}

describe.each(SCENARIOS)('StepRail ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('draws nothing without steps', () => {
    const { container } = render(<StepRail steps={[]} />)
    expect(container.textContent).toBe('')
  })

  it('puts the first node on the left edge and the last on the right, joined by lines', () => {
    render(<StepRail steps={steps('done', 'active', 'pending', 'pending', 'pending')} numbered />)
    const track = screen.getByRole('list')
    expect(styleOf(track).width).toBe('100%')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(5)
    for (const item of items.slice(0, -1)) expect(styleOf(item).flex).toBe(1)
    expect(styleOf(items[4]).flex).toBeUndefined()
    expect(items[4]?.querySelectorAll('div').length).toBeLessThan(
      items[0]?.querySelectorAll('div').length ?? 0
    )
  })

  it('anchors the first label left, the middle ones centred and the last right', () => {
    render(<StepRail steps={steps('done', 'active', 'pending')} numbered />)
    expect(styleOf(screen.getByText('Name')).textAlign).toBe('left')
    expect(styleOf(screen.getByText('Install Command')).textAlign).toBe('center')
    expect(styleOf(screen.getByText('Run the Installer')).textAlign).toBe('right')
    const first = screen.getByText('Name').parentElement as HTMLElement
    const middle = screen.getByText('Install Command').parentElement as HTMLElement
    expect(styleOf(first).flex).toBe(1)
    expect(styleOf(middle).flex).toBe(2)
  })

  it('numbers the waiting steps, paints the current one in the accent and checks the done ones', () => {
    render(<StepRail steps={steps('done', 'active', 'pending')} numbered />)
    const [done, active, pending] = screen.getAllByRole('listitem')
    expect(done?.getAttribute('aria-label')).toBe('Step 1 of 3, Name, done')
    expect(done?.querySelector('svg path')).not.toBeNull()
    expect(styleOf(nodeOf(done as Element)).backgroundColor).toBe(token(scenario, 'ok'))
    expect(styleOf(nodeOf(active as Element)).borderColor).toBe(token(scenario, 'accent'))
    expect(active?.textContent).toContain('2')
    expect(active?.getAttribute('aria-label')).toBe('Step 2 of 3, Install Command, current step')
    expect(pending?.textContent).toContain('3')
    expect(styleOf(nodeOf(pending as Element)).borderColor).toBe(token(scenario, 'sepStrong'))
    expect(spinsIn(document.body)).toHaveLength(0)
  })

  it('turns a spinner ring around the running step and fills its line', () => {
    render(<StepRail steps={steps('done', 'running', 'pending')} numbered />)
    const running = screen.getAllByRole('listitem')[1] as HTMLElement
    expect(spinsIn(running)).toHaveLength(1)
    expect(running.querySelectorAll('circle')).toHaveLength(2)
    expect(motion.repeat).toHaveBeenCalled()
    expect(motion.timing).toHaveBeenCalledWith(360, { duration: 1100, easing: 'linear' })
    expect(motion.timing).toHaveBeenCalledWith(100, { duration: 450, easing: 'cubic' })
    expect(styleOf(nodeOf(running)).borderColor).toBe(token(scenario, 'busy'))
  })

  it('keeps the ring still and the lines full under reduced motion', () => {
    motion.reduce = true
    render(<StepRail steps={steps('done', 'running', 'pending')} numbered />)
    const running = screen.getAllByRole('listitem')[1] as HTMLElement
    expect(running.querySelectorAll('circle')).toHaveLength(2)
    expect(motion.repeat).not.toHaveBeenCalled()
    expect(motion.timing).not.toHaveBeenCalled()
    const fills = animatedIn(document.body).filter((el) => styleOf(el).left === 0)
    expect(fills.length).toBeGreaterThan(0)
    for (const fill of fills) expect(styleOf(fill).width).toBe('100%')
  })

  it('pops a node that has just finished, but not one drawn finished', () => {
    const { rerender } = render(<StepRail steps={steps('done', 'running', 'pending')} numbered />)
    const pops = () =>
      animatedIn(document.body).filter((el) => {
        const transform = styleOf(el).transform as { scale?: number }[] | undefined
        return styleOf(el).borderWidth === undefined && transform?.some((t) => t.scale === 0.55)
      })
    expect(pops()).toHaveLength(0)
    rerender(<StepRail steps={steps('done', 'done', 'running')} numbered />)
    expect(pops()).toHaveLength(1)
  })

  it('spreads one green ring from the last node when the whole flow finishes', () => {
    const burst = () => animatedIn(document.body).filter((el) => styleOf(el).borderWidth === 2)
    const { rerender } = render(<StepRail steps={steps('done', 'running')} numbered />)
    expect(burst()).toHaveLength(0)
    rerender(<StepRail steps={steps('done', 'done')} numbered />)
    expect(burst()).toHaveLength(1)
    expect(styleOf(burst()[0]).borderColor).toBe(token(scenario, 'ok'))
    const last = screen.getAllByRole('listitem')[1] as HTMLElement
    expect(last.contains(burst()[0] as Node)).toBe(true)
  })

  it('does not burst when opened already finished or under reduced motion', () => {
    render(<StepRail steps={steps('done', 'done')} numbered />)
    expect(animatedIn(document.body).filter((el) => styleOf(el).borderWidth === 2)).toHaveLength(0)
    cleanup()
    motion.reduce = true
    const { rerender } = render(<StepRail steps={steps('done', 'running')} numbered />)
    rerender(<StepRail steps={steps('done', 'done')} numbered />)
    expect(animatedIn(document.body).filter((el) => styleOf(el).borderWidth === 2)).toHaveLength(0)
  })

  it('names failed and skipped steps in words beside the mark', () => {
    render(<StepRail steps={steps('done', 'failed', 'skipped')} />)
    expect(screen.getByText('Install Command · failed')).toBeTruthy()
    expect(screen.getByText('Run the Installer · skipped')).toBeTruthy()
    expect(styleOf(screen.getByText('Install Command · failed')).color).toBe(token(scenario, 'bad'))
  })

  it('lists the steps with their state words at phone width', () => {
    env.width = 390
    render(<StepRail steps={steps('done', 'running', 'pending')} />)
    expect(screen.getByText('in progress')).toBeTruthy()
    expect(screen.getByText('not started')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('names only the step that matters now at phone width when asked', () => {
    env.width = 390
    const { rerender } = render(
      <StepRail steps={steps('done', 'running', 'pending')} numbered phoneLabels="current" />
    )
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
    expect(screen.getByText('Install Command')).toBeTruthy()
    expect(screen.queryByText('Name')).toBeNull()
    rerender(<StepRail steps={steps('done', 'done')} numbered phoneLabels="current" />)
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('takes a caller spoken name and number', () => {
    render(
      <StepRail
        steps={[
          { id: 'x', label: 'Set Up', state: 'ready', accessibilityLabel: 'Set Up, ready' },
          { id: 'y', label: 'Build', state: 'pending', number: null },
        ]}
        numbered
      />
    )
    expect(screen.getByRole('listitem', { name: 'Set Up, ready' })).toBeTruthy()
    const build = screen.getAllByRole('listitem')[1] as HTMLElement
    expect(build.textContent).toBe('')
  })
})

describe('WizardSteps', () => {
  beforeEach(() => applyScenario(SCENARIOS[0]))

  const STEPS = [
    { id: 'one', label: 'Application' },
    { id: 'two', label: 'Webhook' },
  ] as const

  it('draws the shared rail from the current step', () => {
    render(<WizardSteps steps={STEPS} current="two" />)
    const [first, second] = screen.getAllByRole('listitem')
    expect(first?.getAttribute('aria-label')).toBe('Step 1 of 2, Application, done')
    expect(second?.getAttribute('aria-label')).toBe('Step 2 of 2, Webhook, current step')
  })

  it('takes each step state when the flow knows them', () => {
    render(<WizardSteps steps={STEPS} states={{ one: 'done', two: 'running' }} />)
    expect(screen.getAllByRole('listitem')[1]?.getAttribute('aria-label')).toBe(
      'Step 2 of 2, Webhook, in progress'
    )
  })

  it('leaves a step without a state pending', () => {
    render(<WizardSteps steps={STEPS} states={{ one: 'active' }} />)
    expect(screen.getAllByRole('listitem')[1]?.getAttribute('aria-label')).toBe(
      'Step 2 of 2, Webhook, not started'
    )
  })
})
