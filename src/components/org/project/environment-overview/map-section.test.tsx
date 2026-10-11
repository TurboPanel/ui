// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MapSection } from '@/components/org/project/environment-overview/map-section'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { overviewSource } from '@/lib/v4/environment-overview.fixtures'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({
  Link: ({ children }: Readonly<{ href: string; children: ReactNode }>) => <>{children}</>,
}))

afterEach(cleanup)

const hrefFor = () => '/x'

describe.each(SCENARIOS)('MapSection ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('starts on This environment and says it is the checked view', () => {
    render(<MapSection source={overviewSource()} hrefFor={hrefFor} />)
    expect(screen.getByRole('radiogroup', { name: 'Map view' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'This environment' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Base' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('group', { name: /^Map of Staging/ })).toBeTruthy()
  })

  it('marks the chosen view on a raised fill', () => {
    render(<MapSection source={overviewSource()} hrefFor={hrefFor} />)
    expect(styleOf(screen.getByRole('radio', { name: 'This environment' })).backgroundColor).toBe(token(scenario, 'surface3'))
  })

  it('Base draws the Base alone: no domains, no status', () => {
    render(<MapSection source={overviewSource()} hrefFor={hrefFor} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Base' }))
    expect(screen.getByRole('radio', { name: 'Base' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByText('shop.example.com')).toBeNull()
    expect(screen.getByText('Domains are set per environment')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()
  })

  it('Differences marks what the environment changes and removes', () => {
    render(<MapSection source={overviewSource()} hrefFor={hrefFor} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Differences' }))
    expect(screen.getByText('Removed in Staging')).toBeTruthy()
    expect(screen.getByText('Changed: start command')).toBeTruthy()
  })

  it('shows a legend entry only for the lines that are drawn', () => {
    render(<MapSection source={overviewSource()} hrefFor={hrefFor} />)
    expect(screen.getByText('visitors')).toBeTruthy()
    expect(screen.getByText('data')).toBeTruthy()
    expect(screen.queryByText('inside the project')).toBeNull()
  })

  it('shows no legend when nothing is joined', () => {
    render(<MapSection source={overviewSource({ hostings: {}, bindings: [], storage: [], services: [] })} hrefFor={hrefFor} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Base' }))
    expect(screen.queryByText('visitors')).toBeNull()
  })
})
