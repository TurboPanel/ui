import { describe, expect, it } from 'vitest'
import worker from '../worker/hosted-ui'

const HTML = '<!doctype html><title>app</title>'

function run(url: string, upstream: Response, method = 'GET') {
  const env = { ASSETS: { fetch: async () => upstream } }
  return worker.fetch(new Request(url, { method }), env)
}

const html = () =>
  new Response(HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

describe('hosted UI Worker', () => {
  it.each(['/_expo/static/js/web/entry-abc.js', '/assets/fonts/Geist.1234.ttf'])(
    'turns the app page served for a missing bundle (%s) into a 404',
    async (path) => {
      const res = await run(`https://testing.turbopanel.dev${path}`, html())
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8')
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(await res.text()).toBe('Not found')
    }
  )

  it('answers HEAD for a missing bundle with a 404 and no body', async () => {
    const res = await run(
      'https://testing.turbopanel.dev/_expo/static/js/web/gone.js',
      html(),
      'HEAD'
    )
    expect(res.status).toBe(404)
    expect(res.body).toBeNull()
  })

  it('passes a real bundle through untouched', async () => {
    const real = new Response('console.log(1)', {
      headers: { 'content-type': 'application/javascript' },
    })
    expect(await run('https://testing.turbopanel.dev/_expo/static/js/web/entry-abc.js', real)).toBe(
      real
    )
  })

  it('passes range and not-modified answers through', async () => {
    const partial = new Response('x', {
      status: 206,
      headers: { 'content-type': 'application/javascript' },
    })
    expect(await run('https://testing.turbopanel.dev/_expo/static/js/web/a.js', partial)).toBe(
      partial
    )
    const unchanged = new Response(null, { status: 304 })
    expect(await run('https://testing.turbopanel.dev/assets/a.1234.png', unchanged)).toBe(unchanged)
  })

  it('passes a non-GET answer that is not a page through', async () => {
    const refused = new Response('no', { status: 405, headers: { 'content-type': 'text/plain' } })
    expect(await run('https://testing.turbopanel.dev/assets/a.png', refused, 'POST')).toBe(refused)
  })

  it.each(['/', '/admin', '/some-org/projects', '/assetsfoo', '/_expo/other'])(
    'leaves the app page alone on %s',
    async (path) => {
      const page = html()
      expect(await run(`https://testing.turbopanel.dev${path}`, page)).toBe(page)
    }
  )
})
