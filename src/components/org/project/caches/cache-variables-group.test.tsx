// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { CacheVariablesGroup } from './cache-variables-group'

const state = vi.hoisted(() => ({ caches: undefined as { caches: unknown[] } | undefined }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({
    orgId: 'o',
    selectedEnvironment: { id: 'e' },
    pathEnvironmentId: 'e',
  }),
}))
vi.mock('@/lib/queries/caches', () => ({
  useEnvironmentCaches: () => ({ data: state.caches }),
}))

afterEach(cleanup)

describe.each(SCENARIOS)('CacheVariablesGroup ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('shows nothing without caches', () => {
    state.caches = { caches: [] }
    const { container } = render(<CacheVariablesGroup />)
    expect(container.textContent).toBe('')
  })

  it('lists each cache variable name and the cache it comes from, never a value', () => {
    state.caches = {
      caches: [
        { name: 'sessions', variables: ['REDIS_HOST', 'REDIS_PASSWORD'] },
        { name: 'queue', variables: ['QUEUE_HOST'] },
      ],
    }
    render(<CacheVariablesGroup />)
    expect(screen.getByText('From Caches')).toBeTruthy()
    expect(screen.getByText('3 variables')).toBeTruthy()
    expect(screen.getByText('REDIS_PASSWORD')).toBeTruthy()
    expect(screen.getAllByText('From cache sessions')).toHaveLength(2)
    expect(screen.getByText('From cache queue')).toBeTruthy()
  })
})
