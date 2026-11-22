// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { useSetServerTerminal } from '@/lib/queries/terminal'

const { setServerTerminal } = vi.hoisted(() => ({ setServerTerminal: vi.fn() }))

vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  setServerTerminal,
}))

describe('useSetServerTerminal', () => {
  it('saves the switch and refreshes the server record and list', async () => {
    setServerTerminal.mockResolvedValue({ ok: true, container: true, ended: 0 })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useSetServerTerminal('o1', 's1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync(true)
    })
    expect(setServerTerminal).toHaveBeenCalledWith('s1', true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org('o1').servers.list })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.org('o1').servers.detail('s1') })
  })
})
