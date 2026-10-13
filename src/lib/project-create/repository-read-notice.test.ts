import { describe, expect, it } from 'vitest'
import { CONTROL_PLANE_UNREACHABLE_COPY } from '@/lib/user-error'
import {
  classifyRepositoryReadError,
  repositoryReadNotice,
} from './repository-read-notice'

const PATH = '/api/client/v1/repositories/0b9c/inspect?ref=l'
const context = { ref: 'l', repositoryName: 'acme/app', defaultBranch: 'main' }

/** What `apiFetch` throws for a non-OK answer. */
function apiError(detail: string): Error {
  return new Error(`${PATH} failed: ${detail}`)
}

describe('classifyRepositoryReadError', () => {
  it('reads the code the server answered with', () => {
    expect(
      classifyRepositoryReadError(
        apiError('HTTP 404: ref_not_found — This repository has no branch called "l".'),
      ),
    ).toBe('ref_not_found')
    expect(classifyRepositoryReadError(apiError('HTTP 400: invalid_ref'))).toBe('invalid_ref')
    expect(classifyRepositoryReadError(apiError('HTTP 503: no_daemon_available'))).toBe(
      'no_server',
    )
    expect(classifyRepositoryReadError(apiError('HTTP 502: timeout'))).toBe('timeout')
    expect(classifyRepositoryReadError(apiError('HTTP 502: source_read_failed'))).toBe('other')
  })

  it("recognises an older control plane's 502 with git's stderr", () => {
    expect(
      classifyRepositoryReadError(
        apiError("HTTP 502: failed — fatal: couldn't find remote ref l\n"),
      ),
    ).toBe('ref_not_found')
  })

  it('tells a transport failure from an answer', () => {
    expect(classifyRepositoryReadError(new TypeError('Failed to fetch'))).toBe('unreachable')
    expect(classifyRepositoryReadError('not an error')).toBe('other')
  })
})

describe('repositoryReadNotice', () => {
  it('is null when the read did not fail', () => {
    expect(repositoryReadNotice(null, context)).toBeNull()
  })

  it('names the missing branch and the default to fall back on', () => {
    const notice = repositoryReadNotice(apiError('HTTP 404: ref_not_found'), context)
    expect(notice?.title).toBe('Branch not found')
    expect(notice?.body).toContain(`There's no branch called "l" in acme/app.`)
    expect(notice?.body).toContain('leave it empty to use the default branch (main)')
    expect(notice?.body).toContain('deploys will fail until a branch with that name exists')
  })

  it('never shows the request, the status, or git output', () => {
    const notice = repositoryReadNotice(
      apiError("HTTP 502: failed — fatal: couldn't find remote ref l\n"),
      context,
    )
    for (const leaked of [PATH, 'HTTP', 'fatal', 'remote ref', 'failed —']) {
      expect(notice?.body).not.toContain(leaked)
    }
    const generic = repositoryReadNotice(
      apiError('HTTP 502: failed — fatal: unable to access https://example.com/o/r.git/'),
      context,
    )
    expect(generic?.title).toBe('Could not read the repository')
    expect(generic?.body).toBe(
      'TurboPanel could not read this repository right now. You can still configure it below.',
    )
  })

  it('does not advise leaving the field empty when it already is', () => {
    const notice = repositoryReadNotice(apiError('HTTP 404: ref_not_found'), {
      ...context,
      ref: '',
    })
    expect(notice?.body).toContain('The default branch (main) does not exist in acme/app.')
    expect(notice?.body).not.toContain('leave it empty')
    const noDefault = repositoryReadNotice(apiError('HTTP 404: ref_not_found'), {
      ...context,
      ref: '',
      defaultBranch: null,
    })
    expect(noDefault?.body).toBe(
      'The default branch does not exist in acme/app. Name the branch to deploy.',
    )
  })

  it('asks for a name that exists when the repository records no default branch', () => {
    const notice = repositoryReadNotice(apiError('HTTP 404: ref_not_found'), {
      ...context,
      defaultBranch: null,
    })
    expect(notice?.body).toContain('records no default branch, so name one that exists')
  })

  it('explains an invalid name in plain words', () => {
    const notice = repositoryReadNotice(apiError('HTTP 400: invalid_ref'), {
      ...context,
      ref: 'a..b',
    })
    expect(notice?.title).toBe('Not a valid branch name')
    expect(notice?.body).toContain(`"a..b" can't be a git branch name`)
  })

  it('has fixed sentences for the other answers', () => {
    expect(
      repositoryReadNotice(apiError('HTTP 503: no_daemon_available'), context)?.body,
    ).toContain('none is connected right now')
    expect(repositoryReadNotice(apiError('HTTP 502: timeout'), context)?.body).toContain(
      'took too long',
    )
    expect(repositoryReadNotice(new TypeError('Failed to fetch'), context)?.body).toBe(
      `${CONTROL_PLANE_UNREACHABLE_COPY} You can still configure it below.`,
    )
    expect(repositoryReadNotice(apiError('HTTP 429'), context)?.body).toContain(
      'Too many attempts',
    )
  })
})
