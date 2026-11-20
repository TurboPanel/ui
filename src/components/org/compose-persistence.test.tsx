// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComposeDocument } from '@/lib/instance-api'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import { usePersistAccountWrites, usePersistProjectCompose } from './compose-persistence'

const api = vi.hoisted(() => ({ updateProject: vi.fn(), updateEnvironment: vi.fn() }))
vi.mock('@/lib/instance-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/instance-api')>()),
  updateProject: api.updateProject,
  updateEnvironment: api.updateEnvironment,
}))

const doc: ComposeDocument = {
  version: 1,
  data: { services: {} },
  presentation: { keyOrder: ['services'], comments: {} },
}

function setup(mode: 'track' | 'seed' | null) {
  const client = createAppQueryClient()
  client.setQueryData(queryKeys.org('o').projects.detail('p'), {
    project: {
      id: 'p',
      options: {
        compose: doc,
        ...(mode
          ? {
              composeSource: {
                sourceId: 's',
                path: 'compose.yaml',
                seededCommitSha: 'a'.repeat(40),
                seededDigest: 'b'.repeat(64),
                mode,
              },
            }
          : {}),
      },
    },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return wrapper
}

describe('Base writes while the project follows its repository', () => {
  beforeEach(() => {
    api.updateProject.mockReset().mockResolvedValue({})
    api.updateEnvironment.mockReset().mockResolvedValue({})
  })

  it('refuses a Base compose save before sending it', async () => {
    const { result } = renderHook(() => usePersistProjectCompose('o', 'p'), {
      wrapper: setup('track'),
    })
    const saved = await result.current.run(doc)
    expect(saved.ok).toBe(false)
    expect(!saved.ok && saved.error).toMatch(/Stop following/)
    expect(api.updateProject).not.toHaveBeenCalled()
  })

  it('refuses a Base account declaration, and sends no environment half either', async () => {
    const { result } = renderHook(() => usePersistAccountWrites('o', 'p'), {
      wrapper: setup('track'),
    })
    const saved = await result.current.run([
      { target: { kind: 'base' }, document: doc },
      { target: { kind: 'environment', environmentId: 'e1' }, document: doc },
    ] as never)
    expect(saved.ok).toBe(false)
    expect(!saved.ok && saved.error).toMatch(/Stop following/)
    expect(api.updateProject).not.toHaveBeenCalled()
    expect(api.updateEnvironment).not.toHaveBeenCalled()
  })

  it('still sends an environment-only account write while following', async () => {
    const { result } = renderHook(() => usePersistAccountWrites('o', 'p'), {
      wrapper: setup('track'),
    })
    const saved = await result.current.run([
      { target: { kind: 'environment', environmentId: 'e1' }, document: doc },
    ] as never)
    expect(saved.ok).toBe(true)
    expect(api.updateEnvironment).toHaveBeenCalledTimes(1)
  })

  it('sends the Base writes once the project is no longer following', async () => {
    const { result } = renderHook(() => usePersistAccountWrites('o', 'p'), {
      wrapper: setup('seed'),
    })
    const saved = await result.current.run([{ target: { kind: 'base' }, document: doc }] as never)
    expect(saved.ok).toBe(true)
    expect(api.updateProject).toHaveBeenCalledTimes(1)
  })
})
