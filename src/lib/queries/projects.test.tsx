// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useCreateProject,
  useDeleteProject,
  useProject,
  useProjects,
  useUpdateProject,
} from '@/lib/queries/projects'

const {
  fetchVisibleProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
} = vi.hoisted(() => ({
  fetchVisibleProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVisibleProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
  configureProject: vi.fn(),
  fetchProjectCatalog: vi.fn(),
  fetchProjectPrincipals: vi.fn(),
  createProjectPrincipal: vi.fn(),
  updateProjectPrincipalAssignments: vi.fn(),
  deleteProjectPrincipal: vi.fn(),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('projects query hooks', () => {
  const orgId = 'org-1'
  const projectId = 'proj-1'

  it('useProjects loads scoped projects', async () => {
    fetchVisibleProjects.mockResolvedValueOnce({
      projects: [{ id: projectId, displayName: 'App' }],
    })

    const { result } = renderHook(() => useProjects(orgId, 'ws-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchVisibleProjects).toHaveBeenCalledWith('ws-1')
    expect(result.current.data?.projects).toHaveLength(1)
  })

  it('useProjects stays disabled when orgId is empty', () => {
    const { result } = renderHook(() => useProjects(''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchVisibleProjects).not.toHaveBeenCalled()
  })

  it('useProject loads a single project', async () => {
    fetchProject.mockResolvedValueOnce({
      project: { id: projectId, displayName: 'App' },
    })

    const { result } = renderHook(() => useProject(orgId, projectId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchProject).toHaveBeenCalledWith(projectId)
  })

  it('useCreateProject runs createProject mutation', async () => {
    createProject.mockResolvedValueOnce({ ok: true, id: 'proj-2' })

    const { result } = renderHook(() => useCreateProject(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      result.current.run({ type: 'empty', displayName: 'New' }),
    ).resolves.toMatchObject({ ok: true, value: { ok: true, id: 'proj-2' } })
  })

  it('useUpdateProject refreshes detail cache on success', async () => {
    updateProject.mockResolvedValueOnce({ ok: true })
    fetchProject.mockResolvedValueOnce({
      project: { id: projectId, displayName: 'Renamed' },
    })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useUpdateProject(orgId, projectId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ displayName: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const cached = client.getQueryData(
        queryKeys.org(orgId).projects.detail(projectId),
      )
      expect(cached).toEqual({
        project: { id: projectId, displayName: 'Renamed' },
      })
    })
  })

  it('useDeleteProject runs delete mutation', async () => {
    deleteProject.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(() => useDeleteProject(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run(projectId)).resolves.toMatchObject({
      ok: true,
    })
  })
})
