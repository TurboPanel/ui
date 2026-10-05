// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentOverviewTab } from '@/components/org/project/environment-overview/environment-overview-tab'
import { overviewSource } from '@/lib/v4/environment-overview.fixtures'

const model = vi.hoisted(() => ({ current: { state: 'loading' } as Record<string, unknown> }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({ orgId: 'o', projectId: 'p', environments: [{}, {}], selectedEnvironment: { id: 'env-1' } }),
}))
vi.mock('@/components/org/project/environment-overview/use-environment-overview', () => ({
  useEnvironmentOverviewModel: () => model.current,
}))
vi.mock('@/components/org/project/project-overview-tab', () => ({
  ProjectOverviewTab: () => <div data-testid="old-screen" />,
}))
vi.mock('@/components/org/project/environment-overview/environment-overview-body', () => ({
  EnvironmentOverviewBody: (props: Readonly<{ ids: { environmentId: string }; environmentCount: number; children?: ReactNode }>) => (
    <div data-testid="body" data-env={props.ids.environmentId} data-count={props.environmentCount} />
  ),
}))

afterEach(cleanup)

describe('EnvironmentOverviewTab', () => {
  it('waits with a spinner while the data loads', () => {
    model.current = { state: 'loading' }
    render(<EnvironmentOverviewTab />)
    expect(screen.getByRole('progressbar')).toBeTruthy()
  })

  it('keeps the old screen when the config view cannot be read', () => {
    model.current = { state: 'unavailable' }
    render(<EnvironmentOverviewTab />)
    expect(screen.getByTestId('old-screen')).toBeTruthy()
  })

  it('shows the Overview for the selected environment once ready', () => {
    model.current = { state: 'ready', source: overviewSource(), deployments: [], running: false }
    render(<EnvironmentOverviewTab />)
    const body = screen.getByTestId('body')
    expect(body.getAttribute('data-env')).toBe('env-1')
    expect(body.getAttribute('data-count')).toBe('2')
  })
})
