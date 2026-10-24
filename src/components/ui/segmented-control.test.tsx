// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import { SegmentedControl } from '@/components/ui/segmented-control'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function coarsePointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
}

const OPTIONS = [
  { value: 'http', label: 'Http' },
  { value: 'tcp', label: 'Tcp' },
  { value: 'udp', label: 'Udp', disabled: true },
] as const

describe('SegmentedControl', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('marks the chosen option and reports a change', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTIONS} value="http" onChange={onChange} />)
    expect(screen.getByRole('tab', { name: 'Http' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: 'Tcp' }).getAttribute('aria-selected')).toBe('false')
    fireEvent.click(screen.getByRole('tab', { name: 'Tcp' }))
    expect(onChange).toHaveBeenCalledWith('tcp')
  })

  it('does not choose a disabled option', () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={OPTIONS} value="http" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Udp' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: 'Udp' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('keeps its compact height with a mouse', () => {
    render(<SegmentedControl options={OPTIONS} value="http" onChange={vi.fn()} />)
    expect(styleOf(screen.getByRole('tab', { name: 'Http' })).minHeight).toBeUndefined()
  })

  it('is 44 pt tall on a coarse pointer and in the phone app', () => {
    coarsePointer(true)
    const { unmount } = render(
      <SegmentedControl options={OPTIONS} value="http" onChange={vi.fn()} />
    )
    expect(styleOf(screen.getByRole('tab', { name: 'Http' })).minHeight).toBe(44)
    unmount()
    coarsePointer(false)
    env.os = 'ios'
    render(<SegmentedControl options={OPTIONS} value="http" onChange={vi.fn()} />)
    expect(styleOf(screen.getByRole('tab', { name: 'Http' })).minHeight).toBe(44)
  })
})
