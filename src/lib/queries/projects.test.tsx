// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useConfigureProject,
  useCreateProject,
  useCreateProjectPrincipal,
  useDeleteProject,
  useDeleteProjectPrincipal,
  useProject,
  useProjectCatalog,
  useProjectPrincipals,
  useProjects,
  useUpdateProject,
  useUpdateProjectPrincipalAssignments,
} from '@/lib/queries/projects'

const {
  fetchVisibleProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
  configureProject,
  fetchProjectCatalog,
  fetchProjectPrincipals,
  createProjectPrincipal,
  updateProjectPrincipal,
  deleteProjectPrincipal,
} = vi.hoisted(() => ({
  fetchVisibleProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  configureProject: vi.fn(),
  fetchProjectCatalog: vi.fn(),
  fetchProjectPrincipals: vi.fn(),
  createProjectPrincipal: vi.fn(),
  updateProjectPrincipal: vi.fn(),
  deleteProjectPrincipal: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchVisibleProjects,
  fetchProject,
  createProject,
  updateProject,
  deleteProject,
  configureProject,
  fetchProjectCatalog,
  fetchProjectPrincipals,
  createProjectPrincipal,
  updateProjectPrincipal,
  deleteProjectPrincipal,
  addPrincipalSshKey: vi.fn(),
  deletePrincipalSshKey: vi.fn(),
  fetchPrincipalSshKeys: vi.fn(),
  updateProjectPrincipalAssignments: vi.fn(),
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
      projects: [{ id: projectId, name: 'App' }],
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
      project: { id: projectId, name: 'App' },
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
      result.current.run({
        type: 'empty',
        workspaceId: 'ws-1',
        name: 'New',
      }),
    ).resolves.toMatchObject({ ok: true, value: { ok: true, id: 'proj-2' } })
  })

  it('useUpdateProject refreshes detail cache on success', async () => {
    updateProject.mockResolvedValueOnce({ ok: true })
    fetchProject.mockResolvedValueOnce({
      project: { id: projectId, name: 'Renamed' },
    })
    const client = createAppQueryClient()

    const { result } = renderHook(() => useUpdateProject(orgId, projectId), {
      wrapper: createWrapper(client),
    })

    await expect(
      result.current.run({ name: 'Renamed' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      const cached = client.getQueryData(
        queryKeys.org(orgId).projects.detail(projectId),
      )
      expect(cached).toEqual({
        project: { id: projectId, name: 'Renamed' },
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

  it('useProjectCatalog loads catalog entries', async () => {
    fetchProjectCatalog.mockResolvedValueOnce({
      catalog: [{ code: 'wordpress', name: 'WordPress' }],
    })

    const { result } = renderHook(() => useProjectCatalog(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchProjectCatalog).toHaveBeenCalled()
  })

  it('useProjectPrincipals loads project principals', async () => {
    fetchProjectPrincipals.mockResolvedValueOnce({ principals: [] })

    const { result } = renderHook(
      () => useProjectPrincipals(orgId, projectId),
      { wrapper: createWrapper() },
    )

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchProjectPrincipals).toHaveBeenCalledWith(projectId)
  })

  it('useProjectPrincipals stays idle without project id', () => {
    const { result } = renderHook(() => useProjectPrincipals(orgId, ''), {
      wrapper: createWrapper(),
    })
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchProjectPrincipals).not.toHaveBeenCalled()
  })

  it('useConfigureProject refreshes detail and list caches', async () => {
    configureProject.mockResolvedValueOnce({ ok: true })
    fetchProject.mockResolvedValueOnce({
      project: { id: projectId, name: 'Configured' },
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useConfigureProject(orgId, projectId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ type: 'docker-compose' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(client.getQueryData(
        queryKeys.org(orgId).projects.detail(projectId),
      )).toEqual({
        project: { id: projectId, name: 'Configured' },
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).projects.all,
    })
  })

  it('useCreateProjectPrincipal invalidates principals list', async () => {
    createProjectPrincipal.mockResolvedValueOnce({ ok: true, id: 'pr-1' })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useCreateProjectPrincipal(orgId, projectId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({ username: 'deploy' }),
    ).resolves.toMatchObject({ ok: true })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    })
  })

  it('useUpdateProjectPrincipalAssignments patches steward services', async () => {
    updateProjectPrincipal.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useUpdateProjectPrincipalAssignments(orgId, projectId),
      { wrapper: createWrapper(client) },
    )

    await expect(
      result.current.run({
        principalId: 'pr-1',
        serviceIds: ['svc-1'],
      }),
    ).resolves.toMatchObject({ ok: true })

    expect(updateProjectPrincipal).toHaveBeenCalledWith(projectId, 'pr-1', {
      serviceIds: ['svc-1'],
    })
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    })
  })

  it('useDeleteProjectPrincipal removes a principal', async () => {
    deleteProjectPrincipal.mockResolvedValueOnce({ ok: true })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeleteProjectPrincipal(orgId, projectId),
      { wrapper: createWrapper(client) },
    )

    await expect(result.current.run('pr-1')).resolves.toMatchObject({
      ok: true,
    })

    expect(deleteProjectPrincipal).toHaveBeenCalledWith(projectId, 'pr-1')
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    })
  })
})
