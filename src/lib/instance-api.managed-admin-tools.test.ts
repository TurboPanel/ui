import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createManagedAdminTool,
  fetchManagedAdminTools,
  removeManagedAdminTool,
  resetManagedAdminToolPassword,
  updateManagedAdminTool,
} from './instance-api'

const calls: { url: string; init?: RequestInit }[] = []

function stubFetch(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  calls.length = 0
})

describe('admin tool calls', () => {
  it('lists the tools of an environment', async () => {
    stubFetch({ tools: [] })
    await expect(fetchManagedAdminTools('e1')).resolves.toEqual({ tools: [] })
    expect(calls[0].url).toMatch(/\/environments\/e1\/managed\/admin-tools$/)
  })

  it('adds a tool with the tool, hostname and access in the body', async () => {
    stubFetch({ ok: true })
    await createManagedAdminTool('e1', {
      tool: 'pgadmin',
      hostname: 'pg.example.com',
      access: 'admin',
    })
    expect(calls[0].url).toMatch(/\/environments\/e1\/managed\/admin-tools$/)
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      tool: 'pgadmin',
      hostname: 'pg.example.com',
      access: 'admin',
    })
  })

  it('resets and updates by project id', async () => {
    stubFetch({ ok: true })
    await resetManagedAdminToolPassword('e1', 'p 1')
    await updateManagedAdminTool('e1', 'p 1')
    expect(calls[0].url).toMatch(/\/admin-tools\/p%201\/password$/)
    expect(calls[1].url).toMatch(/\/admin-tools\/p%201\/update$/)
    expect(calls[0].init?.method).toBe('POST')
    expect(calls[1].init?.method).toBe('POST')
  })

  it('removes with the typed name as a query parameter, not a body', async () => {
    stubFetch({ ok: true })
    await removeManagedAdminTool('e1', 'p1', 'Main Adminer')
    expect(calls[0].url).toMatch(/\/admin-tools\/p1\?confirmName=Main\+Adminer$/)
    expect(calls[0].init?.method).toBe('DELETE')
    expect(calls[0].init?.body).toBeUndefined()
  })
})
