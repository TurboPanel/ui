// @vitest-environment happy-dom
import React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useResendChannelVerification } from '@/lib/queries/notifications'

const { resendNotificationChannelVerification } = vi.hoisted(() => ({
  resendNotificationChannelVerification: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return { ...actual, resendNotificationChannelVerification }
})

function createWrapper() {
  const client = createAppQueryClient()
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useResendChannelVerification', () => {
  it('sends the channel id and the organization it belongs to', async () => {
    resendNotificationChannelVerification.mockResolvedValue(undefined)
    const { result } = renderHook(() => useResendChannelVerification('org-1'), {
      wrapper: createWrapper(),
    })
    expect(await result.current.run('c-1')).toEqual({ ok: true, value: undefined })
    expect(resendNotificationChannelVerification).toHaveBeenCalledWith('c-1', 'org-1')
  })

  it('reports a refusal as an error result instead of throwing', async () => {
    resendNotificationChannelVerification.mockRejectedValue(new Error('HTTP 429: too_soon'))
    const { result } = renderHook(() => useResendChannelVerification(), {
      wrapper: createWrapper(),
    })
    const outcome = await result.current.run('c-1')
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.error).toMatch(/too_soon/)
  })
})
