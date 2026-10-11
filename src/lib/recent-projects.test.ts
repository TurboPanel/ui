// @vitest-environment happy-dom
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function freshModule() {
  vi.resetModules()
  return import('./recent-projects')
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseRecentProjectIds', () => {
  it('reads a stored list and ignores anything else', async () => {
    const { parseRecentProjectIds } = await freshModule()
    expect(parseRecentProjectIds('["a","b"]')).toEqual(['a', 'b'])
    expect(parseRecentProjectIds(null)).toEqual([])
    expect(parseRecentProjectIds(undefined)).toEqual([])
    expect(parseRecentProjectIds('')).toEqual([])
    expect(parseRecentProjectIds('not json')).toEqual([])
    expect(parseRecentProjectIds('{"a":1}')).toEqual([])
    expect(parseRecentProjectIds('["a",3,"",null,"a","b"]')).toEqual(['a', 'b'])
    expect(parseRecentProjectIds('["1","2","3","4","5","6","7"]')).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
    ])
  })
})

describe('touchRecentProjectIds', () => {
  it('moves a project to the front, once, and caps the list at five', async () => {
    const { touchRecentProjectIds } = await freshModule()
    expect(touchRecentProjectIds([], 'a')).toEqual(['a'])
    expect(touchRecentProjectIds(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(touchRecentProjectIds(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual([
      'f',
      'a',
      'b',
      'c',
      'd',
    ])
  })
})

describe('resolveRecentProjects', () => {
  it('keeps recent order, skips projects that are gone and honours the limit', async () => {
    const { resolveRecentProjects } = await freshModule()
    const known = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(resolveRecentProjects(['c', 'gone', 'a'], known)).toEqual([
      { id: 'c' },
      { id: 'a' },
    ])
    expect(resolveRecentProjects(['a', 'b', 'c'], known, 2)).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
    expect(resolveRecentProjects([], known)).toEqual([])
  })
})

describe('recent projects store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  it('records a touch per organization and persists it', async () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    const mod = await freshModule()
    expect(mod.getRecentProjectIds('org1')).toEqual([])
    mod.recordProjectTouch('org1', 'p1')
    mod.recordProjectTouch('org1', 'p2')
    mod.recordProjectTouch('org2', 'p9')
    expect(mod.getRecentProjectIds('org1')).toEqual(['p2', 'p1'])
    expect(mod.getRecentProjectIds('org2')).toEqual(['p9'])
    expect(store.data.get(mod.recentProjectsStorageKey('org1'))).toBe('["p2","p1"]')
  })

  it('does not write or notify when the project is already first', async () => {
    const store = memoryStorage()
    vi.stubGlobal('localStorage', store)
    const mod = await freshModule()
    const listener = vi.fn()
    mod.subscribeRecentProjects(listener)
    mod.recordProjectTouch('org1', 'p1')
    mod.recordProjectTouch('org1', 'p1')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores a touch with no organization or project, and an empty org read', async () => {
    const mod = await freshModule()
    mod.recordProjectTouch('', 'p1')
    mod.recordProjectTouch('org1', '')
    expect(mod.getRecentProjectIds('')).toEqual([])
    expect(mod.getRecentProjectIds('org1')).toEqual([])
  })

  it('starts from what this device saved', async () => {
    vi.stubGlobal(
      'localStorage',
      memoryStorage({ 'turbopanel.recentProjects.org1': '["x","y"]' }),
    )
    const mod = await freshModule()
    expect(mod.getRecentProjectIds('org1')).toEqual(['x', 'y'])
  })

  it('keeps the list in memory when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const mod = await freshModule()
    expect(mod.getRecentProjectIds('org1')).toEqual([])
    mod.recordProjectTouch('org1', 'p1')
    expect(mod.getRecentProjectIds('org1')).toEqual(['p1'])
  })

  it('keeps the list in memory where there is no storage at all (phone app)', async () => {
    vi.stubGlobal('localStorage', undefined)
    const mod = await freshModule()
    expect(mod.getRecentProjectIds('org1')).toEqual([])
    mod.recordProjectTouch('org1', 'p1')
    expect(mod.getRecentProjectIds('org1')).toEqual(['p1'])
  })

  it('unsubscribes listeners', async () => {
    const mod = await freshModule()
    const listener = vi.fn()
    const off = mod.subscribeRecentProjects(listener)
    off()
    mod.recordProjectTouch('org1', 'p1')
    expect(listener).not.toHaveBeenCalled()
  })

  it('re-renders a hook when a project is touched, with a stable snapshot between', async () => {
    const mod = await freshModule()
    const { result } = renderHook(() => mod.useRecentProjectIds('org1'))
    const first = result.current
    expect(first).toEqual([])
    act(() => mod.recordProjectTouch('org1', 'p1'))
    expect(result.current).toEqual(['p1'])
    const second = result.current
    act(() => mod.recordProjectTouch('org1', 'p1'))
    expect(result.current).toBe(second)
  })
})
