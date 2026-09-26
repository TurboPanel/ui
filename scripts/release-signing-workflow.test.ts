import { readFileSync } from 'node:fs'
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
    expect(release).toContain('.manifest-signer/scripts/sign-manifest.ts release-assets/manifest.json')
    expect(release).toContain('RELEASE_SIGNING_KEY: ${{ secrets.RELEASE_SIGNING_KEY }}')
  })

  it('pins the signer to an exact turbopaneld commit', () => {
    const signer = release.slice(release.indexOf('- name: Check out the manifest signer'))
    const ref = /\n\s+ref: (\S+)/.exec(signer)?.[1] ?? ''
    expect(ref).toMatch(/^[0-9a-f]{40}$/)
  })

  it('hands the signing key to the called workflow on the canary path', () => {
    expect(release).toContain('RELEASE_SIGNING_KEY:\n        description:')
    expect(canary).toContain('RELEASE_SIGNING_KEY: ${{ secrets.RELEASE_SIGNING_KEY }}')
  })
})
