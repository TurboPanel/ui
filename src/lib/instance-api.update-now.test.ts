import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startUpdateNow, UpdateNowRefusedError } from './instance-api'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('startUpdateNow', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the update now route and answers the started run', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, runId: 'run-1' }, 202))
    await expect(startUpdateNow()).resolves.toEqual({ ok: true, runId: 'run-1' })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('/api/admin/v1/instance/updates/now')
    expect((init as RequestInit).method).toBe('POST')
  })

  it('answers up to date when nothing was started', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, upToDate: true }))
    await expect(startUpdateNow()).resolves.toEqual({ ok: true, upToDate: true })
  })

  it('throws a typed refusal with the code, the sentence and the running run', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          ok: false,
          error: 'run_active',
          message: 'Another update is already in progress.',
          activeRunId: 'run-9',
        },
        409
      )
    )
    const err = await startUpdateNow().catch((caught: unknown) => caught)
    expect(err).toBeInstanceOf(UpdateNowRefusedError)
    const refusal = err as UpdateNowRefusedError
    expect(refusal.code).toBe('run_active')
    expect(refusal.serverMessage).toBe('Another update is already in progress.')
    expect(refusal.activeRunId).toBe('run-9')
  })

  it('reads the wait of a press too soon and an unreachable release server', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: false, error: 'check_too_soon', retryAfterSeconds: 30 }, 429)
    )
    const soon = (await startUpdateNow().catch(
      (caught: unknown) => caught
    )) as UpdateNowRefusedError
    expect(soon.code).toBe('check_too_soon')
    expect(soon.retryAfterSeconds).toBe(30)

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'release_unreachable' }, 503))
    const down = (await startUpdateNow().catch(
      (caught: unknown) => caught
    )) as UpdateNowRefusedError
    expect(down).toBeInstanceOf(UpdateNowRefusedError)
    expect(down.code).toBe('release_unreachable')
    expect(down.retryAfterSeconds).toBeNull()
  })

  it('leaves out a sentence or run id the control plane did not send', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'paused' }, 409))
    const err = (await startUpdateNow().catch((caught: unknown) => caught)) as UpdateNowRefusedError
    expect(err.code).toBe('paused')
    expect(err.serverMessage).toBeNull()
    expect(err.activeRunId).toBeNull()
  })

  it('throws a plain error for an unknown refusal or an unreadable body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, error: 'Forbidden' }, 403))
    const forbidden = await startUpdateNow().catch((caught: unknown) => caught)
    expect(forbidden).not.toBeInstanceOf(UpdateNowRefusedError)
    expect(String(forbidden)).toContain('403')

    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 500 }))
    const broken = await startUpdateNow().catch((caught: unknown) => caught)
    expect(broken).not.toBeInstanceOf(UpdateNowRefusedError)
    expect(String(broken)).toContain('500')
  })
})
