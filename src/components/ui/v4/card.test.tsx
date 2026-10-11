// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { Card } from '@/components/ui/v4/card'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('Card ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is a surface with a hairline border and 12 px corners, padded 20', () => {
    render(<Card>hello</Card>)
    const style = styleOf(screen.getByText('hello'))
    expect(style.backgroundColor).toBe(token(scenario, 'surface'))
    expect(style.borderColor).toBe(token(scenario, 'sep'))
    expect(style.borderRadius).toBe(12)
    expect(style.padding).toBe(20)
  })

  it('can run edge to edge and take the stronger border', () => {
    render(<Card padded={false} strong>hello</Card>)
    const style = styleOf(screen.getByText('hello'))
    expect(style).not.toHaveProperty('padding')
    expect(style.borderColor).toBe(token(scenario, 'sepStrong'))
  })
})
