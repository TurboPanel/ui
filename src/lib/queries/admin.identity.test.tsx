// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import { useInstanceIdentity, useSaveInstanceIdentityNext } from './admin'

const { fetchInstanceIdentity, saveInstanceIdentityNext } = vi.hoisted(() => ({
  fetchInstanceIdentity: vi.fn(),
  saveInstanceIdentityNext: vi.fn(),
}))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return { ...actual, fetchInstanceIdentity, saveInstanceIdentityNext }
})

function setup() {
  const queryClient = createAppQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('control plane identity hooks', () => {
  it('useInstanceIdentity reads the identity under its key', async () => {
    fetchInstanceIdentity.mockResolvedValue({ ok: true, configured: true })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useInstanceIdentity(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(queryKeys.admin.instanceIdentity)).toEqual({
      ok: true,
      configured: true,
    })
  })

  it('useInstanceIdentity stays idle when disabled', () => {
    fetchInstanceIdentity.mockClear()
    const { wrapper } = setup()
    renderHook(() => useInstanceIdentity({ enabled: false }), { wrapper })
    expect(fetchInstanceIdentity).not.toHaveBeenCalled()
  })

  it('saving the next key refreshes the identity', async () => {
    saveInstanceIdentityNext.mockResolvedValue({ ok: true, next: null })
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSaveInstanceIdentityNext(), { wrapper })
    await act(async () => {
      await result.current.run(null)
    })
    expect(saveInstanceIdentityNext.mock.calls[0]?.[0]).toBeNull()
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.instanceIdentity })
  })
})
