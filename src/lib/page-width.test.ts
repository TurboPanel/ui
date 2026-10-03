import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contentMaxWidthFor,
  getPageWidth,
  parsePageWidth,
  setPageWidth,
  togglePageWidth,
} from './page-width'

describe('page width', () => {
  it('reads anything but "wide" as contained', () => {
    expect(parsePageWidth('wide')).toBe('wide')
    expect(parsePageWidth('contained')).toBe('contained')
    expect(parsePageWidth(null)).toBe('contained')
    expect(parsePageWidth('nonsense')).toBe('contained')
  })

  it('caps contained content and lets wide content fill the room', () => {
    expect(contentMaxWidthFor('contained', 2400, 1400)).toBe(1400)
    expect(contentMaxWidthFor('contained', 900, 1400)).toBe(900)
    expect(contentMaxWidthFor('wide', 2400, 1400)).toBe(2400)
  })

  it('toggles and survives storage that is missing', () => {
    setPageWidth('contained')
    togglePageWidth()
    expect(getPageWidth()).toBe('wide')
    togglePageWidth()
    expect(getPageWidth()).toBe('contained')
  })
})

describe('page width storage', () => {
  const KEY = 'turbopanel.pageWidth'

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
    return import('./page-width')
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts from the stored choice and saves a new one', async () => {
    const storage = memoryStorage('wide')
    vi.stubGlobal('localStorage', storage)
    const mod = await freshModule()
    expect(mod.getPageWidth()).toBe('wide')
    mod.setPageWidth('contained')
    expect(storage.data.get(KEY)).toBe('contained')
  })

  it('keeps working when storage throws', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const mod = await freshModule()
    expect(mod.getPageWidth()).toBe('contained')
    mod.togglePageWidth()
    expect(mod.getPageWidth()).toBe('wide')
  })

  it('keeps working when there is no storage at all', async () => {
    vi.stubGlobal('localStorage', undefined)
    const mod = await freshModule()
    expect(mod.getPageWidth()).toBe('contained')
    mod.togglePageWidth()
    expect(mod.getPageWidth()).toBe('wide')
  })

  it('tells subscribers about a change, once, and stops after unsubscribe', async () => {
    vi.stubGlobal('localStorage', memoryStorage())
    const mod = await freshModule()
    let calls = 0
    const stop = mod.subscribePageWidth(() => {
      calls += 1
    })
    mod.setPageWidth('wide')
    mod.setPageWidth('wide')
    expect(calls).toBe(1)
    stop()
    mod.setPageWidth('contained')
    expect(calls).toBe(1)
  })
})
