// Hosted UI Worker. The static assets answer every request; this Worker only runs in
// front of the hashed bundle prefixes (wrangler.jsonc assets.run_worker_first).
// Why: assets.not_found_handling is "single-page-application", so a bundle path that no
// longer exists (an old page asking for a script from a previous build) would come back as
// the app page with status 200. The browser then fails to run HTML as a script. Here such
// a response becomes a plain 404, which the page can recover from.

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> }
}

const HASHED_PREFIXES = ['/_expo/static/', '/assets/']

function isHashedPath(pathname: string): boolean {
  return HASHED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await env.ASSETS.fetch(request)
    const { pathname } = new URL(request.url)
    const type = response.headers.get('content-type') ?? ''
    if (!isHashedPath(pathname) || !type.toLowerCase().startsWith('text/html')) {
      return response
    }
    // _headers does not apply to a response built here, so nosniff is set by hand.
    return new Response(request.method === 'HEAD' ? null : 'Not found', {
      status: 404,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    })
  },
}
