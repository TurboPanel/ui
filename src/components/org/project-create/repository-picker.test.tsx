// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveWizardSelectedSource } from '@/lib/project-create/selected-source'
import type { RepositoryRecord } from '@/lib/instance-api'
import { createAppQueryClient } from '@/lib/query-client'
import {
  useAttachRepository,
  useRepositories,
} from '@/lib/queries/releases'

const {
  fetchRepositories,
  fetchRepository,
  attachRepository,
} = vi.hoisted(() => ({
  fetchRepositories: vi.fn(),
  fetchRepository: vi.fn(),
  attachRepository: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchRepositories,
    fetchRepository,
    attachRepository,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

const orgId = 'org-1'
const attached: RepositoryRecord = {
  id: 'src-new',
  organizationId: orgId,
  connectionId: 'conn-1',
  secretId: null,
  provider: 'github',
  repositoryUrl: 'https://github.com/acme/api.git',
  repositoryExternalId: 'ext-1',
  defaultBranch: 'main',
  subdirectory: null,
  autoDeploy: 'immediate',
  metadata: null,
  options: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('project-create repository picker Continue gate', () => {
  it('enables Continue after attaching a repository absent from the initial list', async () => {
    fetchRepositories.mockResolvedValue({ repositories: [] })
    attachRepository.mockResolvedValueOnce({
      ok: true,
      id: attached.id,
      reused: false,
    })
    fetchRepository.mockResolvedValueOnce({ repository: attached })

    const client = createAppQueryClient()
    const wrapper = createWrapper(client)

    const listHook = renderHook(() => useRepositories(orgId), { wrapper })
    await waitFor(() => {
      expect(listHook.result.current.isSuccess).toBe(true)
    })
    expect(listHook.result.current.data?.repositories).toEqual([])

    let selected = resolveWizardSelectedSource(
      listHook.result.current.data?.repositories,
      '',
      null,
    )
    expect(selected).toBeNull()

    const attachHook = renderHook(() => useAttachRepository(orgId), { wrapper })
    const result = await attachHook.result.current.run({
      connectionId: 'conn-1',
      repositoryExternalId: 'ext-1',
      repositoryUrl: attached.repositoryUrl,
      defaultBranch: 'main',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    selected = resolveWizardSelectedSource(
      listHook.result.current.data?.repositories,
      result.value.id,
      result.value.repository,
    )
    expect(selected).toEqual(attached)
  })
})
