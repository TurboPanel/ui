import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVERS_LAYOUT,
  getStoredServersLayout,
  parseServersLayout,
  resolveServersFleetSurface,
  SERVERS_LAYOUT_LABELS,
  SERVERS_LAYOUTS,
  SERVERS_TILE_MIN_WIDTH,
  serversLayoutAccessibilityLabel,
  setStoredServersLayout,
  showServersToolbarUpdate,
  usesCompactServersList,
} from './servers-layout'

describe('parseServersLayout', () => {
  it('defaults to the detail list', () => {
    expect(parseServersLayout(null)).toBe(DEFAULT_SERVERS_LAYOUT)
    expect(parseServersLayout(undefined)).toBe('list')
    expect(parseServersLayout('')).toBe('list')
    expect(parseServersLayout('grid')).toBe('list')
    expect(parseServersLayout('cards')).toBe('list')
  })

  it('accepts list and tiles only', () => {
    expect(parseServersLayout('list')).toBe('list')
    expect(parseServersLayout('tiles')).toBe('tiles')
    expect(parseServersLayout('summary')).toBe('tiles')
    expect(parseServersLayout('detail')).toBe('list')
    expect(SERVERS_LAYOUTS).toEqual(['list', 'tiles'])
  })
})

describe('servers layout labels', () => {
  it('names the views Detail and Summary', () => {
    expect(SERVERS_LAYOUT_LABELS.list).toBe('Detail')
    expect(SERVERS_LAYOUT_LABELS.tiles).toBe('Summary')
    expect(serversLayoutAccessibilityLabel('list')).toBe('Detail view')
    expect(serversLayoutAccessibilityLabel('tiles')).toBe('Summary view')
  })
})

describe('usesCompactServersList', () => {
  it('stacks Detail rows on native and keeps the table on web', () => {
    expect(usesCompactServersList('ios')).toBe(true)
    expect(usesCompactServersList('android')).toBe(true)
    expect(usesCompactServersList('web')).toBe(false)
  })
})

describe('resolveServersFleetSurface', () => {
  it('keeps the web Detail table inside the fleet panel', () => {
    expect(
      resolveServersFleetSurface({
        layout: 'list',
        serverCount: 2,
        compactChrome: false,
        hasError: false,
      }),
    ).toEqual({
      showToolbarSelectAll: false,
      showDetailFleet: true,
      showSummaryFleet: false,
      showStatusPanel: false,
      showDetailInPanel: true,
      showFleetPanel: true,
    })
  })

  it('renders native Detail and Summary outside glass', () => {
    expect(
      resolveServersFleetSurface({
        layout: 'list',
        serverCount: 2,
        compactChrome: true,
        hasError: false,
      }).showDetailInPanel,
    ).toBe(false)
    expect(
      resolveServersFleetSurface({
        layout: 'tiles',
        serverCount: 2,
        compactChrome: true,
        hasError: false,
      }),
    ).toMatchObject({
      showToolbarSelectAll: true,
      showSummaryFleet: true,
      showFleetPanel: false,
    })
  })

  it('shows a status panel when the fleet is empty or failed', () => {
    expect(
      resolveServersFleetSurface({
        layout: 'list',
        serverCount: 0,
        compactChrome: true,
        hasError: false,
      }).showFleetPanel,
    ).toBe(true)
    expect(
      resolveServersFleetSurface({
        layout: 'tiles',
        serverCount: 3,
        compactChrome: false,
        hasError: true,
      }).showStatusPanel,
    ).toBe(true)
  })
})

describe('showServersToolbarUpdate', () => {
  it('hides Update on native until hosts are selected', () => {
    expect(showServersToolbarUpdate(true, false, 0)).toBe(true)
    expect(showServersToolbarUpdate(true, true, 0)).toBe(false)
    expect(showServersToolbarUpdate(true, true, 2)).toBe(true)
    expect(showServersToolbarUpdate(false, true, 2)).toBe(false)
  })
})

describe('servers layout storage', () => {
  const memory = new Map<string, string>()
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value)
    },
  }

  afterEach(() => {
    memory.clear()
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  it('defaults when localStorage is missing', () => {
    expect(getStoredServersLayout()).toBe('list')
  })

  it('round-trips a stored tiles preference', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: store,
    })
    expect(getStoredServersLayout()).toBe('list')
    setStoredServersLayout('tiles')
    expect(getStoredServersLayout()).toBe('tiles')
    setStoredServersLayout('list')
    expect(getStoredServersLayout()).toBe('list')
  })

  it('ignores writes when localStorage is missing', () => {
    expect(() => setStoredServersLayout('tiles')).not.toThrow()
    expect(getStoredServersLayout()).toBe('list')
  })
})

describe('SERVERS_TILE_MIN_WIDTH', () => {
  it('is compact enough to tile several cards', () => {
    expect(SERVERS_TILE_MIN_WIDTH).toBeGreaterThanOrEqual(180)
    expect(SERVERS_TILE_MIN_WIDTH).toBeLessThanOrEqual(240)
  })
})
