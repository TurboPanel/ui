import { readFileSync } from 'node:fs'
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
})
