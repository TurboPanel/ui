// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseMapSection } from '@/components/org/project/base-tab/base-map-section'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { configView } from '@/lib/v4/environment-overview.fixtures'
import type { BaseEnvironment } from '@/lib/v4/project-base'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({
  Link: ({ children }: Readonly<{ href: string; children: ReactNode }>) => <>{children}</>,
}))

afterEach(cleanup)

const production = configView({ environmentId: 'e1', changes: [] })
const staging = configView({ environmentId: 'e2' })
const environments: BaseEnvironment[] = [
  { id: 'e1', name: 'Production', view: production },
  { id: 'e2', name: 'Staging', view: staging },
  { id: 'e3', name: 'Broken', view: undefined },
]

describe.each(SCENARIOS)('BaseMapSection ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('draws the Base alone to start with, and offers each environment it could read', () => {
    render(<BaseMapSection view={production} environments={environments} principals={[]} />)
    expect(screen.getByRole('radiogroup', { name: 'Compare the Base with' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Production' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Staging' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Broken' })).toBeNull()
    expect(screen.getByRole('group', { name: /^Map of the Base/ })).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
  })

  it('compares the Base with an environment: what it changes and removes', () => {
    render(<BaseMapSection view={production} environments={environments} principals={[]} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Staging' }))
    expect(screen.getByRole('radio', { name: 'Staging' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Removed in Staging')).toBeTruthy()
    expect(screen.getByText('Changed: start command')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'None' }))
    expect(screen.queryByText('Removed in Staging')).toBeNull()
  })
})

describe('BaseMapSection without environments to compare', () => {
  it('offers no switch', () => {
    render(<BaseMapSection view={production} environments={[]} principals={undefined} />)
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.getByRole('group', { name: /^Map of the Base/ })).toBeTruthy()
  })
})
