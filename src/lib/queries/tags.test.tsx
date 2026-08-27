// @vitest-environment happy-dom
import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '@/lib/query-client'
import { queryKeys } from '@/lib/query-keys'
import {
  useCreateTag,
  useDeleteTag,
  useMarkers,
  useSetEntityTags,
  useTag,
  useTags,
  useUpdateTag,
} from '@/lib/queries/tags'

const {
  fetchTags,
  fetchTag,
  fetchMarkers,
  createTag,
  updateTag,
  deleteTag,
  setEntityTags,
} = vi.hoisted(() => ({
  fetchTags: vi.fn(),
  fetchTag: vi.fn(),
  fetchMarkers: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
  setEntityTags: vi.fn(),
}))

vi.mock('@/lib/instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/instance-api')>()
  return {
    ...actual,
    fetchTags,
    fetchTag,
    fetchMarkers,
    createTag,
    updateTag,
    deleteTag,
    setEntityTags,
  }
})

function createWrapper(client = createAppQueryClient()) {
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('tags query hooks', () => {
  const orgId = 'org-1'
  const filter = { projectId: 'p1' }

  it('useTags loads the org collection', async () => {
    fetchTags.mockResolvedValueOnce({
      tags: [{ id: 'tag-1', name: 'prod' }],
    })

    const { result } = renderHook(() => useTags(orgId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchTags).toHaveBeenCalledWith(undefined)
    expect(result.current.data?.tags).toHaveLength(1)
  })

  it('useTags loads a parent-scoped list', async () => {
    fetchTags.mockResolvedValueOnce({ tags: [] })

    const { result } = renderHook(() => useTags(orgId, filter), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(fetchTags).toHaveBeenCalledWith(filter)
  })

  it('useTags stays idle when disabled or org id is empty', () => {
    const disabled = renderHook(
      () => useTags(orgId, filter, { enabled: false }),
      { wrapper: createWrapper() },
    )
    const empty = renderHook(() => useTags('', filter), {
      wrapper: createWrapper(),
    })
    expect(disabled.result.current.fetchStatus).toBe('idle')
    expect(empty.result.current.fetchStatus).toBe('idle')
    expect(fetchTags).not.toHaveBeenCalled()
  })

  it('useTag and useMarkers load by id', async () => {
    fetchTag.mockResolvedValueOnce({ tag: { id: 'tag-1', name: 'prod' } })
    fetchMarkers.mockResolvedValueOnce({ markers: [{ id: 'm-1', tagId: 'tag-1' }] })

    const tagHook = renderHook(() => useTag(orgId, 'tag-1'), {
      wrapper: createWrapper(),
    })
    const markerHook = renderHook(() => useMarkers(orgId, 'tag-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(tagHook.result.current.isSuccess).toBe(true)
      expect(markerHook.result.current.isSuccess).toBe(true)
    })
    expect(fetchTag).toHaveBeenCalledWith('tag-1')
    expect(fetchMarkers).toHaveBeenCalledWith('tag-1')
  })

  it('useCreateTag returns ok/value on success', async () => {
    createTag.mockResolvedValueOnce({ ok: true, id: 'tag-2' })

    const { result } = renderHook(() => useCreateTag(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run({ name: 'prod' })).resolves.toEqual({
      ok: true,
      value: { ok: true, id: 'tag-2' },
    })
    expect(createTag).toHaveBeenCalledWith({ name: 'prod' })
  })

  it('useCreateTag returns mutation errors', async () => {
    createTag.mockRejectedValueOnce(new Error('tag_name_in_use'))

    const { result } = renderHook(() => useCreateTag(orgId), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run({ name: 'prod' })).resolves.toEqual({
      ok: false,
      error: 'tag_name_in_use',
    })
  })

  it('useUpdateTag and useDeleteTag proxy mutations', async () => {
    updateTag.mockResolvedValueOnce({ ok: true })
    deleteTag.mockResolvedValueOnce({ ok: true })

    const updateHook = renderHook(() => useUpdateTag(orgId), {
      wrapper: createWrapper(),
    })
    const deleteHook = renderHook(() => useDeleteTag(orgId), {
      wrapper: createWrapper(),
    })

    await expect(
      updateHook.result.current.run({
        tagId: 'tag-1',
        body: { name: 'staging' },
      }),
    ).resolves.toMatchObject({ ok: true })
    expect(updateTag).toHaveBeenCalledWith('tag-1', { name: 'staging' })
    await expect(
      deleteHook.result.current.run('tag-1'),
    ).resolves.toMatchObject({ ok: true })
    expect(deleteTag.mock.calls[0]?.[0]).toBe('tag-1')
  })

  it('useSetEntityTags invalidates marker queries after replacement', async () => {
    fetchMarkers.mockResolvedValue({ markers: [] })
    setEntityTags.mockResolvedValueOnce({ ok: true, tags: [] })
    const client = createAppQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = createWrapper(client)

    const markers = renderHook(() => useMarkers(orgId, 'tag-1'), { wrapper })
    await waitFor(() => {
      expect(markers.result.current.isSuccess).toBe(true)
    })
    expect(fetchMarkers).toHaveBeenCalledTimes(1)

    const { result } = renderHook(() => useSetEntityTags(orgId, filter), {
      wrapper,
    })
    await expect(result.current.run(['tag-1'])).resolves.toMatchObject({
      ok: true,
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.org(orgId).tags.all,
    })
    await waitFor(() => {
      expect(fetchMarkers.mock.calls.length).toBeGreaterThan(1)
    })
  })

  it('useSetEntityTags replaces markers for one parent', async () => {
    setEntityTags.mockResolvedValueOnce({ ok: true, tags: [] })

    const { result } = renderHook(() => useSetEntityTags(orgId, filter), {
      wrapper: createWrapper(),
    })

    await expect(result.current.run(['tag-1'])).resolves.toMatchObject({
      ok: true,
    })
    expect(setEntityTags).toHaveBeenCalledWith({
      projectId: 'p1',
      tagIds: ['tag-1'],
    })
  })
})
