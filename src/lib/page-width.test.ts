import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contentAlignFor,
  contentMaxWidthFor,
  getPageWidth,
  parsePageWidth,
  setPageWidth,
} from './page-width'

describe('page width', () => {
  it('keeps left, center and wide, and reads anything else as left', () => {
    expect(parsePageWidth('wide')).toBe('wide')
    expect(parsePageWidth('center')).toBe('center')
    expect(parsePageWidth('left')).toBe('left')
    expect(parsePageWidth('contained')).toBe('left')
    expect(parsePageWidth(null)).toBe('left')
    expect(parsePageWidth('nonsense')).toBe('left')
  })

  it('caps contained content and lets wide content fill the room', () => {
    expect(contentMaxWidthFor('left', 2400, 1400)).toBe(1400)
    expect(contentMaxWidthFor('center', 2400, 1400)).toBe(1400)
    expect(contentMaxWidthFor('left', 900, 1400)).toBe(900)
    expect(contentMaxWidthFor('center', 900, 1400)).toBe(900)
    expect(contentMaxWidthFor('wide', 2400, 1400)).toBe(2400)
  })

  it('pins left and wide columns to the start and centres only center', () => {
    expect(contentAlignFor('left')).toBe('flex-start')
    expect(contentAlignFor('wide')).toBe('flex-start')
    expect(contentAlignFor('center')).toBe('center')
  })

  it('switches between the three layouts', () => {
    setPageWidth('center')
    expect(getPageWidth()).toBe('center')
    setPageWidth('wide')
    expect(getPageWidth()).toBe('wide')
    setPageWidth('left')
    expect(getPageWidth()).toBe('left')
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
    mod.setPageWidth('center')
    expect(storage.data.get(KEY)).toBe('center')
  })

  it('reads a stored "contained" as left', async () => {
    vi.stubGlobal('localStorage', memoryStorage('contained'))
    const mod = await freshModule()
    expect(mod.getPageWidth()).toBe('left')
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
    expect(mod.getPageWidth()).toBe('left')
    mod.setPageWidth('wide')
    expect(mod.getPageWidth()).toBe('wide')
  })

  it('keeps working when there is no storage at all', async () => {
    vi.stubGlobal('localStorage', undefined)
    const mod = await freshModule()
    expect(mod.getPageWidth()).toBe('left')
    mod.setPageWidth('wide')
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
    mod.setPageWidth('left')
    expect(calls).toBe(1)
  })
})
