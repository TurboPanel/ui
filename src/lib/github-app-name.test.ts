import { describe, expect, it } from 'vitest'
import {
  GITHUB_APP_NAME_MAX,
  githubAppNameError,
  normalizeGithubAppName,
  suggestGithubAppName,
} from './github-app-name'

describe('suggestGithubAppName', () => {
  it('generates a distinct name each time', () => {
    // GitHub App names are unique across all of GitHub, and the form rejects a
    // duplicate *after* the operator has already left for GitHub — so the
    // default cannot be merely probably-free.
    const names = new Set(Array.from({ length: 200 }, () => suggestGithubAppName()))
    expect(names.size).toBeGreaterThan(190)
  })

  it("fits GitHub's name cap with room to spare", () => {
    for (let i = 0; i < 50; i += 1) {
      expect([...suggestGithubAppName()].length).toBeLessThanOrEqual(GITHUB_APP_NAME_MAX)
    }
  })

  it('uses only characters that survive slugging', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(suggestGithubAppName()).toMatch(/^turbopanel-[a-z]+-[a-z0-9]{6}$/)
    }
  })

  it('always passes its own validator', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(githubAppNameError(suggestGithubAppName())).toBeNull()
    }
  })
})

describe('githubAppNameError', () => {
  it('requires a name', () => {
    expect(githubAppNameError('   ')).toBe('Name is required.')
  })

  it('rejects names over 34 characters', () => {
    expect(githubAppNameError('x'.repeat(35))).toContain('34')
  })

  it('rejects control characters', () => {
    expect(githubAppNameError(`turbopanel\u0007app`)).toContain('control characters')
  })

  it('accepts an operator-chosen name', () => {
    expect(githubAppNameError('Acme Deployments')).toBeNull()
    expect(normalizeGithubAppName('  Acme Deployments  ')).toBe('Acme Deployments')
  })
})
