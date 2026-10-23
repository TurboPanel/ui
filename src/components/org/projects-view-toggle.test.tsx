// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { ProjectsViewToggle } from './projects-view-toggle'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

afterEach(cleanup)

describe.each(SCENARIOS)('Projects view toggle ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a radio group of Grid and List with the current view checked', () => {
    render(<ProjectsViewToggle value="list" onChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Grid' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('radio', { name: 'List' }).getAttribute('aria-checked')).toBe('true')
  })

  it('reports the view that was chosen', () => {
    const onChange = vi.fn()
    render(<ProjectsViewToggle value="grid" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'List' }))
    expect(onChange).toHaveBeenCalledWith('list')
  })
})
