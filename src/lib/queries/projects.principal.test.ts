// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import {
  usePrincipalSshKeys,
  useUpdateProjectPrincipal,
} from '@/lib/queries/projects'

const { fetchPrincipalSshKeys, updateProjectPrincipal } = vi.hoisted(() => ({
  fetchPrincipalSshKeys: vi.fn(),
  updateProjectPrincipal: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchPrincipalSshKeys,
    updateProjectPrincipal,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: ReactNode }>) {
    return createElement(QueryClientProvider, { client }, children)
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('project principal remaining branches', () => {
  const orgId = 'org-1'
  const projectId = 'proj-1'
  const principalId = 'pr-1'

  it('useUpdateProjectPrincipal forwards optional steward and entitlement fields', async () => {
    updateProjectPrincipal.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(
      () => useUpdateProjectPrincipal(orgId, projectId),
      { wrapper: createWrapper() },
    )

    await result.current.run({
      principalId,
      serviceIds: ['svc-1'],
      entitlements: [{ runtime: 'node', series: '22' }],
      access: 'shell',
    })

    expect(updateProjectPrincipal).toHaveBeenCalledWith(
      projectId,
      principalId,
      {
        serviceIds: ['svc-1'],
        entitlements: [{ runtime: 'node', series: '22' }],
        access: 'shell',
      },
    )
  })

  it('usePrincipalSshKeys stays idle when disabled or project id is empty', () => {
    const disabled = renderHook(
      () => usePrincipalSshKeys(orgId, projectId, principalId, false),
      { wrapper: createWrapper() },
    )
    const emptyProject = renderHook(
      () => usePrincipalSshKeys(orgId, '', principalId),
      { wrapper: createWrapper() },
    )
    const emptyOrg = renderHook(
      () => usePrincipalSshKeys('', projectId, principalId),
      { wrapper: createWrapper() },
    )
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(emptyProject.result.current.fetchStatus).toBe('idle')
    expect(emptyOrg.result.current.fetchStatus).toBe('idle')
    expect(fetchPrincipalSshKeys).not.toHaveBeenCalled()
  })

  it('usePrincipalSshKeys loads when enabled is omitted', async () => {
    fetchPrincipalSshKeys.mockResolvedValueOnce({ keys: [] })

    const { result } = renderHook(
      () => usePrincipalSshKeys(orgId, projectId, principalId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchPrincipalSshKeys).toHaveBeenCalledWith(projectId, principalId)
  })
})
