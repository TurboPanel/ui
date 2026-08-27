import { describe, expect, it } from 'vitest'
import {
  githubManifestReturnNotice,
  readGithubManifestReturn,
} from './github-manifest-return'

describe('readGithubManifestReturn', () => {
  it('treats a present created param as success', () => {
    expect(readGithubManifestReturn({ created: 'app-1' })).toEqual({
      created: true,
      error: null,
    })
  })

  it('takes the first value when Expo repeats a query key', () => {
    expect(readGithubManifestReturn({ error: ['conflict', 'other'] })).toEqual({
      created: false,
      error: 'conflict',
    })
    expect(
      readGithubManifestReturn({ created: ['app-1', 'app-2'] }),
    ).toEqual({
      created: true,
      error: null,
    })
  })

  it('treats empty created or error params as absent', () => {
    expect(readGithubManifestReturn({ created: '', error: '' })).toEqual({
      created: false,
      error: null,
    })
  })
})

describe('githubManifestReturnNotice', () => {
  it('confirms a registered App', () => {
    const notice = githubManifestReturnNotice({ created: true, error: null })
    expect(notice?.tone).toBe('info')
    expect(notice?.title).toBe('GitHub App registered')
  })

  it('maps each known error without leaking API text', () => {
    const bodies: Record<string, string> = {
      conversion_failed:
        'GitHub could not finish creating the App. Start Create a GitHub App again.',
      state_invalid:
        'This create link expired. Start Create a GitHub App again.',
      conflict: 'An application with that GitHub App id is already registered.',
      forbidden: 'This create link belongs to a different organization.',
      unavailable:
        'The control plane could not complete registration. Try again in a moment.',
      invalid_request:
        'This page opened without a finished GitHub create. If an App is already listed below, it registered successfully.',
    }
    for (const [code, body] of Object.entries(bodies)) {
      const notice = githubManifestReturnNotice({
        created: false,
        error: code,
      })
      expect(notice?.tone).toBe('warning')
      expect(notice?.title).toBe('GitHub App was not registered')
      expect(notice?.body).toBe(body)
    }
  })

  it('falls back when the error code is unknown', () => {
    const notice = githubManifestReturnNotice({
      created: false,
      error: 'not_a_real_code',
    })
    expect(notice?.tone).toBe('warning')
    expect(notice?.body).toBe(
      'Registration did not finish. Start Create a GitHub App again.',
    )
  })

  it('does not treat an incomplete callback as a failed registration', () => {
    const notice = githubManifestReturnNotice({
      created: false,
      error: 'invalid_request',
    })
    expect(notice?.body).toContain('already listed below')
  })

  it('is silent when the page was opened without a return query', () => {
    expect(
      githubManifestReturnNotice({ created: false, error: null }),
    ).toBeNull()
  })
})
