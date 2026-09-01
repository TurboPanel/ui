// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { useImportDockerRun } from '@/lib/queries/docker-run'

const { importDockerRunCommand } = vi.hoisted(() => ({
  importDockerRunCommand: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    importDockerRunCommand,
  }
})

function createWrapper() {
  const client = createAppQueryClient()
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useImportDockerRun', () => {
  it('returns the translated compose fragment on success', async () => {
    importDockerRunCommand.mockResolvedValueOnce({
      ok: true,
      fragment: { image: 'nginx:latest' },
    })

    const { result } = renderHook(() => useImportDockerRun(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ serviceName: 'web', argv: 'docker run nginx' }),
    ).resolves.toEqual({
      ok: true,
      value: { ok: true, fragment: { image: 'nginx:latest' } },
    })
    expect(importDockerRunCommand).toHaveBeenCalledWith({
      serviceName: 'web',
      argv: 'docker run nginx',
    })
  })

  it('surfaces the fallback error when parsing fails', async () => {
    importDockerRunCommand.mockRejectedValueOnce(new Error('unparseable_command'))

    const { result } = renderHook(() => useImportDockerRun(), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ serviceName: 'web', argv: 'not a docker command' }),
    ).resolves.toEqual({ ok: false, error: 'unparseable_command' })
  })
})
