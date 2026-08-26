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
  })
})

describe('githubManifestReturnNotice', () => {
  it('confirms a registered App', () => {
    const notice = githubManifestReturnNotice({ created: true, error: null })
    expect(notice?.tone).toBe('info')
    expect(notice?.title).toBe('GitHub App registered')
  })

  it('maps a known error without leaking API text', () => {
    const notice = githubManifestReturnNotice({
      created: false,
      error: 'conversion_failed',
    })
    expect(notice?.tone).toBe('warning')
    expect(notice?.body).toContain('Start Create a GitHub App again')
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
