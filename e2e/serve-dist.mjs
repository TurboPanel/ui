// Serves the web export (`pnpm export` writes it to dist/`) on one port with the
// same single-page-app fallback the hosted Worker uses (wrangler.jsonc
// `not_found_handling`). No dependency: Playwright's webServer starts this.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const port = Number(process.env.E2E_PORT ?? 4173)

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
}

function fileFor(pathname) {
  const target = normalize(join(root, decodeURIComponent(pathname)))
  if (target !== root && !target.startsWith(root + sep)) return null
  for (const candidate of [target, `${target}.html`, join(target, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

createServer((req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost')
  // The API is mocked in the browser; a request that reaches here is a bug.
  if (pathname.startsWith('/api/')) {
    res.writeHead(502, { 'content-type': 'application/json' })
    res.end('{"error":"api_not_mocked"}')
    return
  }
  const file = fileFor(pathname) ?? join(root, 'index.html')
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
}).listen(port, '127.0.0.1')
