// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBaseTabModel } from '@/components/org/project/base-tab/use-base-tab'
import { configView } from '@/lib/v4/environment-overview.fixtures'

const q = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  views: {} as { views: Record<string, unknown>; isLoading: boolean },
  principals: {} as Record<string, unknown>,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => q.ctx }))
vi.mock('@/lib/queries/environment-cards', () => ({ useEnvironmentConfigViews: () => q.views }))
vi.mock('@/lib/queries/projects', () => ({ useProjectPrincipals: () => q.principals }))

const PRODUCTION = { id: 'e1', name: 'Production' }
const STAGING = { id: 'e2', name: 'Staging' }

beforeEach(() => {
  q.ctx = { orgId: 'o', projectId: 'p', environments: [PRODUCTION, STAGING], loading: false }
  q.views = {
    views: { e1: configView({ changes: [] }), e2: configView() },
    isLoading: false,
  }
  q.principals = { isLoading: false, data: { principals: [] } }
})

describe('useBaseTabModel', () => {
  it('is ready with the Base, each environment and how it relates to the Base', () => {
    const { result } = renderHook(() => useBaseTabModel())
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.base).toBe(result.current.view.base)
    expect(result.current.environments.map((item) => item.name)).toEqual(['Production', 'Staging'])
    expect(result.current.rows.map((row) => row.relationText)).toEqual([
      'Follows the Base',
      'Follows the Base · 4 changes',
    ])
    expect(result.current.principals).toEqual([])
  })

  it('leaves the Linux users out when they could not be read', () => {
    q.principals = { isLoading: false, data: undefined }
    const { result } = renderHook(() => useBaseTabModel())
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.principals).toBeUndefined()
  })

  it('waits while the environments, the configuration or the Linux users load', () => {
    q.ctx = { ...q.ctx, environments: [], loading: true }
    expect(renderHook(() => useBaseTabModel()).result.current.state).toBe('loading')
    q.ctx = { ...q.ctx, environments: [PRODUCTION], loading: false }
    q.views = { views: {}, isLoading: true }
    expect(renderHook(() => useBaseTabModel()).result.current.state).toBe('loading')
    q.views = { views: { e1: configView() }, isLoading: false }
    q.principals = { isLoading: true, data: undefined }
    expect(renderHook(() => useBaseTabModel()).result.current.state).toBe('loading')
  })

  it('is empty for a project with no environment: there is no Base to read', () => {
    q.ctx = { ...q.ctx, environments: [] }
    expect(renderHook(() => useBaseTabModel()).result.current.state).toBe('empty')
  })

  it('is unavailable when no environment could be read, so the old screen stays', () => {
    q.views = { views: { e1: undefined, e2: undefined }, isLoading: false }
    expect(renderHook(() => useBaseTabModel()).result.current.state).toBe('unavailable')
  })

  it('still shows the Base when only one environment could be read', () => {
    q.views = { views: { e1: undefined, e2: configView() }, isLoading: false }
    const { result } = renderHook(() => useBaseTabModel())
    expect(result.current.state).toBe('ready')
    if (result.current.state !== 'ready') throw new Error('not ready')
    expect(result.current.rows[0]).toMatchObject({ followsBase: null, relationText: '' })
  })
})
