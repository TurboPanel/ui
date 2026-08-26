// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient, queryKeys } from '@/lib/query-client'
import {
  useAddPrincipalSshKey,
  useDeletePrincipalSshKey,
  usePrincipalSshKeys,
  useUpdateProjectPrincipal,
} from '@/lib/queries/projects'

const {
  fetchPrincipalSshKeys,
  addPrincipalSshKey,
  deletePrincipalSshKey,
  updateProjectPrincipal,
} = vi.hoisted(() => ({
  fetchPrincipalSshKeys: vi.fn(),
  addPrincipalSshKey: vi.fn(),
  deletePrincipalSshKey: vi.fn(),
  updateProjectPrincipal: vi.fn(),
}))

vi.mock('@/lib/instance-api', () => ({
  fetchPrincipalSshKeys,
  addPrincipalSshKey,
  deletePrincipalSshKey,
  updateProjectPrincipal,
  configureProject: vi.fn(),
  createProject: vi.fn(),
  createProjectPrincipal: vi.fn(),
  deleteProject: vi.fn(),
  deleteProjectPrincipal: vi.fn(),
  fetchProject: vi.fn(),
  fetchProjectCatalog: vi.fn(),
  fetchProjectPrincipals: vi.fn(),
  fetchVisibleProjects: vi.fn(),
  updateProject: vi.fn(),
}))

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('principal ssh key hooks', () => {
  const orgId = 'org-1'
  const projectId = 'proj-1'
  const principalId = 'pr-1'

  it('usePrincipalSshKeys loads one account’s keys', async () => {
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

  it('usePrincipalSshKeys stays idle without a principal', () => {
    const { result } = renderHook(
      () => usePrincipalSshKeys(orgId, projectId, ''),
      { wrapper: createWrapper() },
    )
    expect(result.current.fetchStatus).toBe('idle')
    expect(fetchPrincipalSshKeys).not.toHaveBeenCalled()
  })

  it('adding a key refreshes the principals list as well as the keys', async () => {
    // The list carries `sshKeyCount`, and effective access depends on whether
    // the account holds any key at all. Refreshing only the key list would
    // leave the row still reading "cannot sign in" after the first key.
    addPrincipalSshKey.mockResolvedValueOnce({
      key: { id: 'key-1' },
      reconciled: { queuedServerIds: ['srv-1'], failedServerIds: [] },
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useAddPrincipalSshKey(orgId, projectId, principalId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run({ name: 'laptop', publicKey: 'ssh-ed25519 AAAA' })

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).projects.principalSshKeys(
        projectId,
        principalId,
      ),
    })
  })

  it('removing a key refreshes both lists too', async () => {
    deletePrincipalSshKey.mockResolvedValueOnce({
      ok: true,
      reconciled: { queuedServerIds: [], failedServerIds: [] },
    })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(
      () => useDeletePrincipalSshKey(orgId, projectId, principalId),
      { wrapper: createWrapper(client) },
    )

    await result.current.run('key-1')

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: queryKeys.org(orgId).projects.principals(projectId),
      })
    })
    expect(deletePrincipalSshKey).toHaveBeenCalledWith(
      projectId,
      principalId,
      'key-1',
    )
  })

  it('an access edit sends only `access`', async () => {
    // The API reads an absent field as "leave it alone". Sending an empty
    // steward or entitlement list alongside would silently revoke something
    // the operator never touched.
    updateProjectPrincipal.mockResolvedValueOnce({ ok: true })

    const { result } = renderHook(
      () => useUpdateProjectPrincipal(orgId, projectId),
      { wrapper: createWrapper() },
    )

    await result.current.run({ principalId, access: 'sftp' })

    expect(updateProjectPrincipal).toHaveBeenCalledWith(
      projectId,
      principalId,
      { access: 'sftp' },
    )
  })
})
