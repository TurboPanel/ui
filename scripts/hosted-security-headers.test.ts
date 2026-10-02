import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

describe('hosted UI security headers', () => {
  const headers = readFileSync(path.join(ROOT, 'public', '_headers'), 'utf8')

  it('applies to every path', () => {
    expect(headers).toMatch(/^\/\*$/m)
  })

  it('refuses framing and content sniffing and limits referrers', () => {
    expect(headers).toContain('X-Content-Type-Options: nosniff')
    expect(headers).toContain('X-Frame-Options: DENY')
    expect(headers).toContain("Content-Security-Policy: frame-ancestors 'none'")
    expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin')
    expect(headers).toContain('Permissions-Policy:')
  })

  it('sends HSTS with the same value as the API, without preload', () => {
    expect(headers).toMatch(/^ {2}Strict-Transport-Security: max-age=31536000; includeSubDomains$/m)
    expect(headers).not.toMatch(/^ {2}Strict-Transport-Security:.*preload/im)
  })

  it('ships the script CSP report-only, never enforced', () => {
    expect(headers).toMatch(/^ {2}Content-Security-Policy-Report-Only: .*script-src 'self'/m)
    const enforced = headers.match(/^ {2}Content-Security-Policy: (.*)$/m)?.[1]
    expect(enforced).toBe("frame-ancestors 'none'")
  })

  it('allows exactly the inline scripts the exported pages contain', () => {
    const index = path.join(ROOT, 'dist', 'index.html')
    if (!existsSync(index)) return // needs `pnpm run export`; CI export steps run it
    const html = readFileSync(index, 'utf8')
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    expect(inline.length).toBeGreaterThan(0)
    for (const [, body] of inline) {
      const hash = createHash('sha256').update(body).digest('base64')
      expect(headers).toContain(`'sha256-${hash}'`)
    }
  })
})
