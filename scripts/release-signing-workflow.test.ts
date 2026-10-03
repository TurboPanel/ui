import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The UI manifest is signed in release.yml with turbopaneld's signer; these
// pins keep the step from being dropped, reordered or pointed at a moving ref.
const root = join(__dirname, '..')
const release = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8')
const canary = readFileSync(join(root, '.github/workflows/canary.yml'), 'utf8')

describe('release manifest signing', () => {
  it('signs the manifest after writing it and before uploading it', () => {
    const written = release.indexOf('- name: Package release assets and write the manifest')
    const signed = release.indexOf('- name: Sign the manifest')
    const uploaded = release.indexOf('- name: Upload release assets')
    expect(written).toBeGreaterThanOrEqual(0)
    expect(signed).toBeGreaterThan(written)
    expect(uploaded).toBeGreaterThan(signed)
    expect(release).toContain(
      '.manifest-signer/scripts/sign-manifest.ts release-assets/manifest.json'
    )
    expect(release).toContain('RELEASE_SIGNING_KEY: ${{ secrets.TURBOPANEL_RELEASE_SIGNING_KEY }}')
  })

  it('pins the signer to an exact turbopaneld commit', () => {
    const signer = release.slice(release.indexOf('- name: Check out the manifest signer'))
    const ref = /\n\s+ref: (\S+)/.exec(signer)?.[1] ?? ''
    expect(ref).toMatch(/^[0-9a-f]{40}$/)
  })

  it('reads the signing key from the canary, rc or release environment only', () => {
    expect(release).toContain(
      "environment: ${{ inputs.channel == 'canary' && 'canary' || (inputs.channel == 'rc' && 'rc' || 'release') }}"
    )
    expect(release).not.toContain('secrets.RELEASE_SIGNING_KEY')
    // The environment secret only reaches a called workflow when its caller inherits secrets.
    expect(canary).toMatch(/^\s*secrets:\s*inherit\b/m)
  })

  it('only callers of release.yml inherit secrets, and none falls back to a repo-level signing key', () => {
    const dir = join(root, '.github/workflows')
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.yml'))) {
      const text = readFileSync(join(dir, name), 'utf8')
      if (!text.includes('uses: ./.github/workflows/release.yml')) {
        expect(text, name).not.toMatch(/^\s*secrets:\s*inherit\b/m)
      }
      expect(text, name).not.toContain('secrets.RELEASE_SIGNING_KEY')
    }
  })
})
