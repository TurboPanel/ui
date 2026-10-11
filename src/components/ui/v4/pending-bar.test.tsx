// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { PendingBar, type PendingItem } from '@/components/ui/v4/pending-bar'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

const ITEMS: readonly PendingItem[] = [
  { key: 'start', area: 'Web app', label: 'Start command', was: 'node server.js', now: 'node dist/main.js' },
  { key: 'var', area: 'Variables', label: 'LOG_LEVEL', was: 'info', now: 'debug' },
]

function setup(props: Partial<Parameters<typeof PendingBar>[0]> = {}) {
  const handlers = { onDeploy: vi.fn(), onDiscard: vi.fn() }
  render(<PendingBar count={2} envName="Staging" {...handlers} {...props} />)
  return handlers
}

describe.each(SCENARIOS)('PendingBar ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('says what is saved and when it goes live', () => {
    setup()
    expect(screen.getByLabelText('Not deployed')).toBeTruthy()
    expect(screen.getByText('2 changes · Saved. Goes live when you deploy Staging.')).toBeTruthy()
  })

  it('has exactly one primary action, Deploy now, and it deploys', () => {
    const { onDeploy } = setup()
    const deploy = screen.getByRole('button', { name: 'Deploy now' })
    expect(styleOf(deploy).backgroundColor).toBe(token(scenario, 'accent'))
    fireEvent.click(deploy)
    expect(onDeploy).toHaveBeenCalledTimes(1)
    const fills = screen
      .getAllByRole('button')
      .filter((b) => styleOf(b).backgroundColor === token(scenario, 'accent'))
    expect(fills).toHaveLength(1)
  })

  it('discards', () => {
    const { onDiscard } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('draws nothing when nothing is pending', () => {
    const { container } = render(<PendingBar count={0} envName="Staging" onDeploy={vi.fn()} onDiscard={vi.fn()} />)
    expect(container.textContent).toBe('')
  })

  it('has no Review button without a handler', () => {
    setup()
    expect(screen.queryByRole('button', { name: /changes/ })).toBeNull()
  })

  it('reviews the changes with was and now, and undoes one by key', () => {
    const onReview = vi.fn()
    const onUndo = vi.fn()
    setup({ onReview, onUndo, reviewOpen: true, items: ITEMS })
    expect(screen.getByRole('button', { name: 'Hide changes' })).toBeTruthy()
    expect(screen.getByText('Start command')).toBeTruthy()
    expect(styleOf(screen.getByText('node server.js')).textDecorationLine).toBe('line-through')
    expect(screen.getByText('node dist/main.js')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Undo LOG_LEVEL' }))
    expect(onUndo).toHaveBeenCalledWith('var')
    fireEvent.click(screen.getByRole('button', { name: 'Hide changes' }))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('keeps the list closed until asked, and offers Review', () => {
    setup({ onReview: vi.fn(), items: ITEMS })
    expect(screen.getByRole('button', { name: 'Review changes' })).toBeTruthy()
    expect(screen.queryByText('Start command')).toBeNull()
  })

  it('shows no Undo without a handler', () => {
    setup({ reviewOpen: true, items: ITEMS })
    expect(screen.queryByRole('button', { name: /Undo/ })).toBeNull()
  })

  it('takes its own summary and deploy label (the Base)', () => {
    setup({ summary: '3 environments follow this Base.', deployLabel: 'Deploy selected' })
    expect(screen.getByText('3 environments follow this Base.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deploy selected' })).toBeTruthy()
  })

  it('blocks Discard and Deploy while deploying', () => {
    const { onDeploy, onDiscard } = setup({ busy: true })
    fireEvent.click(screen.getByRole('button', { name: 'Deploy now' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDeploy).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
  })

  it('can disable Deploy', () => {
    const { onDeploy } = setup({ deployDisabled: true })
    fireEvent.click(screen.getByRole('button', { name: 'Deploy now' }))
    expect(onDeploy).not.toHaveBeenCalled()
  })

  it('is a raised bar; on the web it stays at the bottom of the page, on a phone it flows', () => {
    setup()
    const bar = screen.getByLabelText('Not deployed').parentElement
    expect(styleOf(bar).backgroundColor).toBe(token(scenario, 'surface2'))
    expect(styleOf(bar).maxWidth).toBe(760)
    if (scenario.os === 'web') {
      expect(styleOf(bar).position).toBe('sticky')
      expect(styleOf(bar).bottom).toBe(16)
    } else {
      expect(styleOf(bar)).not.toHaveProperty('position')
      expect(styleOf(bar)).not.toHaveProperty('bottom')
    }
  })
})
