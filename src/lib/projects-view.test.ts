import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseProjectsView } from './projects-view'

const KEY = 'turbopanel.projectsView'

function memoryStorage(initial?: string) {
  const data = new Map<string, string>()
  if (initial) data.set(KEY, initial)
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

async function freshModule() {
  vi.resetModules()
  return import('./projects-view')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('projects view', () => {
  it('keeps list and reads anything else as grid', () => {
    expect(parseProjectsView('list')).toBe('list')
    expect(parseProjectsView('grid')).toBe('grid')
    expect(parseProjectsView(null)).toBe('grid')
    expect(parseProjectsView('rows')).toBe('grid')
  })

  it('starts from the stored choice and saves a new one for this browser', async () => {
    const storage = memoryStorage('list')
    vi.stubGlobal('localStorage', storage)
    const mod = await freshModule()
    expect(mod.getProjectsView()).toBe('list')
    mod.setProjectsView('grid')
    expect(storage.data.get(KEY)).toBe('grid')
    expect(mod.getProjectsView()).toBe('grid')
  })

  it('tells listeners once per change', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const mod = await freshModule()
    let heard = 0
    const stop = mod.subscribeProjectsView(() => {
      heard += 1
    })
    mod.setProjectsView('list')
    mod.setProjectsView('list')
    expect(heard).toBe(1)
    stop()
    mod.setProjectsView('grid')
    expect(heard).toBe(1)
  })

  it('keeps the choice in memory when storage throws or is missing', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const mod = await freshModule()
    expect(mod.getProjectsView()).toBe('grid')
    mod.setProjectsView('list')
    expect(mod.getProjectsView()).toBe('list')
  })
})
