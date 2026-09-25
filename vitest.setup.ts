import { afterEach } from 'vitest'

/**
 * A test that reaches the network through the real `fetch` is testing
 * whatever answers on that port, not the code. Record every call that no test
 * stubbed and fail the test that made it. Tests that need `fetch` stub it
 * themselves (`vi.stubGlobal('fetch', …)`), which replaces this guard.
 */
const unmocked: string[] = []

globalThis.fetch = ((input: RequestInfo | URL) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  unmocked.push(url)
  return Promise.reject(new Error(`unmocked fetch in a test: ${url}`))
}) as typeof fetch

afterEach(() => {
  if (unmocked.length === 0) return
  const calls = unmocked.splice(0).join(', ')
  throw new Error(`test made unmocked network requests: ${calls}`)
})
