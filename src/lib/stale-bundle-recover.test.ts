import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SOURCE = readFileSync(join(ROOT, 'public', 'stale-bundle-recover.js'), 'utf8')
const ORIGIN = 'https://panel.test'
const BUNDLE = `${ORIGIN}/_expo/static/js/web/entry-abc.js`

type Listener = (ev: unknown) => void
interface Api {
  isBundleUrl(url: string, origin: string): boolean
  isStaleBundleEvent(ev: unknown, origin: string): boolean
  isStaleBundleRejection(reason: unknown): boolean
  mayReload(stored: string | null, now: number): boolean
}

function load(now = 0) {
  const module = { exports: {} as Api & { install(win: unknown): void } }
  const Date = { now: () => now }
  vm.runInNewContext(SOURCE, { module, Date, URL, Number, String, isFinite })
  return module.exports
}

function fakeWindow(opts: { storage?: 'ok' | 'throws'; now?: number } = {}) {
  const listeners: Record<string, Listener> = {}
  const store = new Map<string, string>()
  const warnings: string[] = []
  let reloads = 0
  const win = {
    name: '',
    location: {
      origin: ORIGIN,
      reload: () => {
        reloads += 1
      },
    },
    console: { warn: (m: string) => warnings.push(m) },
    sessionStorage:
      opts.storage === 'throws'
        ? {
            getItem: () => {
              throw new Error('blocked')
            },
            setItem: () => {
              throw new Error('blocked')
            },
          }
        : {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
          },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = fn
    },
  }
  return { win, listeners, store, warnings, reloads: () => reloads }
}

const scriptError = (src: string) => ({
  type: 'error',
  target: { tagName: 'SCRIPT', src },
})

function install(w: ReturnType<typeof fakeWindow>, now: number) {
  load(now).install(w.win)
}

describe('stale bundle detection', () => {
  const api = load()
  it('flags a failed built script or stylesheet on this origin', () => {
    expect(api.isStaleBundleEvent(scriptError(BUNDLE), ORIGIN)).toBe(true)
    expect(
      api.isStaleBundleEvent(
        { type: 'error', target: { tagName: 'LINK', href: '/_expo/static/css/a.css' } },
        ORIGIN
      )
    ).toBe(true)
  })
  it('flags a built file that threw a parse error', () => {
    const ev = { type: 'error', target: {}, filename: BUNDLE, message: "Unexpected token '<'" }
    expect(api.isStaleBundleEvent(ev, ORIGIN)).toBe(true)
  })
  it('ignores everything else', () => {
    const img = { type: 'error', target: { tagName: 'IMG', src: BUNDLE } }
    const other = scriptError('https://cdn.example/_expo/static/a.js')
    const asset = scriptError(`${ORIGIN}/assets/font.ttf`)
    const runtime = {
      type: 'error',
      target: {},
      filename: BUNDLE,
      message: 'x is undefined',
      error: new TypeError('x'),
    }
    const json = {
      type: 'error',
      target: {},
      filename: BUNDLE,
      message: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
      error: new SyntaxError('x'),
    }
    for (const ev of [img, other, asset, runtime, json, null]) {
      expect(api.isStaleBundleEvent(ev, ORIGIN)).toBe(false)
    }
  })
  it('flags chunk-load rejections only', () => {
    for (const m of [
      'Loading chunk 3 failed',
      'Failed to fetch dynamically imported module: x',
      'Importing a module script failed.',
      'error loading dynamically imported module',
    ]) {
      expect(api.isStaleBundleRejection(new Error(m))).toBe(true)
    }
    expect(api.isStaleBundleRejection(new Error('Network request failed'))).toBe(false)
    expect(api.isStaleBundleRejection(undefined)).toBe(false)
  })
})

describe('reload gate', () => {
  const api = load()
  it('allows the first reload, blocks within a minute, allows later', () => {
    expect(api.mayReload(null, 1000)).toBe(true)
    expect(api.mayReload('1000', 30000)).toBe(false)
    expect(api.mayReload('1000', 61001)).toBe(true)
    expect(api.mayReload('junk', 1000)).toBe(true)
    expect(api.mayReload('5000', 1000)).toBe(true)
  })
})

describe('installed listeners', () => {
  it('reload once, then never again, across a reload', () => {
    const w = fakeWindow()
    install(w, 100000)
    w.listeners.error(scriptError(BUNDLE))
    w.listeners.error(scriptError(BUNDLE))
    expect(w.reloads()).toBe(1)
    // The page reloads: fresh script state, same sessionStorage.
    install(w, 105000)
    w.listeners.unhandledrejection({ reason: new Error('Loading chunk 1 failed') })
    expect(w.reloads()).toBe(1)
    expect(w.warnings).toHaveLength(1)
  })
  it('does not reload on unrelated errors', () => {
    const w = fakeWindow()
    install(w, 1)
    w.listeners.error({ type: 'error', target: { tagName: 'IMG', src: '/a.png' } })
    w.listeners.unhandledrejection({ reason: new Error('boom') })
    expect(w.reloads()).toBe(0)
  })
  it('falls back to window.name when storage is blocked, still once', () => {
    const w = fakeWindow({ storage: 'throws' })
    install(w, 100000)
    w.listeners.error(scriptError(BUNDLE))
    expect(w.reloads()).toBe(1)
    install(w, 101000)
    w.listeners.error(scriptError(BUNDLE))
    expect(w.reloads()).toBe(1)
  })
  it('does not reload when no marker can be stored', () => {
    const w = fakeWindow({ storage: 'throws' })
    Object.defineProperty(w.win, 'name', { get: () => '', set: () => {} })
    install(w, 1)
    w.listeners.error(scriptError(BUNDLE))
    expect(w.reloads()).toBe(0)
  })
})

describe('native isolation', () => {
  function walk(dir: string, out: string[] = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.(tsx?|mjs|js)$/.test(name) && !name.includes('.test.')) out.push(p)
    }
    return out
  }
  it('is referenced only by the web-only page shell', () => {
    const users = walk(join(ROOT, 'src'))
      .filter((f) => readFileSync(f, 'utf8').includes('stale-bundle-recover'))
      .map((f) => f.slice(ROOT.length + 1))
    expect(users).toEqual([join('src', 'app', '+html.tsx')])
  })
  it('has no module syntax and touches no app code', () => {
    expect(SOURCE).not.toMatch(/^\s*(import|export)\s/m)
    expect(SOURCE).not.toMatch(/require\(/)
  })
})
