import { describe, expect, it } from 'vitest'
import type { RepositoryProvider, RepositoryRecord } from '@/lib/instance-api'
import {
  repositoryAccessLabel,
  repositoryLabel,
  repositoryProviderLabel,
} from '@/lib/repository-label'

function row(repositoryUrl: string): RepositoryRecord {
  return { repositoryUrl } as RepositoryRecord
}

function providerRow(
  provider: RepositoryProvider,
  repositoryUrl: string,
): Pick<RepositoryRecord, 'provider' | 'repositoryUrl'> {
  return { provider, repositoryUrl }
}

describe('repositoryLabel', () => {
  it('reduces a GitHub HTTPS URL to owner/repo', () => {
    expect(repositoryLabel(row('https://github.com/owner/repo'))).toBe(
      'owner/repo',
    )
  })

  it('strips a trailing .git suffix before taking the last two segments', () => {
    expect(repositoryLabel(row('https://github.com/owner/repo.git'))).toBe(
      'owner/repo',
    )
    expect(repositoryLabel(row('git@github.com:owner/repo.git'))).toBe(
      'owner/repo',
    )
  })

  it('parses SSH and scp-style hosts the same way', () => {
    expect(repositoryLabel(row('ssh://git@github.com/owner/repo'))).toBe(
      'owner/repo',
    )
    expect(repositoryLabel(row('git@github.com:owner/repo'))).toBe('owner/repo')
  })

  it('uses the last two path segments on odd hosts and ports', () => {
    expect(repositoryLabel(row('https://gitea.lan:3000/org/app'))).toBe(
      'org/app',
    )
    expect(repositoryLabel(row('https://gitlab.example.com/group/project'))).toBe(
      'group/project',
    )
    expect(repositoryLabel(row('github.com/owner/repo'))).toBe('owner/repo')
  })

  it('keeps nested group paths as the last two segments', () => {
    expect(
      repositoryLabel(row('https://gitlab.com/group/sub/repo')),
    ).toBe('sub/repo')
  })

  it('returns the original URL when fewer than two path segments remain', () => {
    expect(repositoryLabel(row('owner'))).toBe('owner')
    expect(repositoryLabel(row(''))).toBe('')
    expect(repositoryLabel(row('.git'))).toBe('.git')
  })

  it('still labels a host-only URL from the remaining two tokens', () => {
    expect(repositoryLabel(row('https://github.com'))).toBe('https/github.com')
    expect(repositoryLabel(row('https://github.com/owner'))).toBe(
      'github.com/owner',
    )
  })

  it('ignores empty segments from a trailing slash', () => {
    expect(repositoryLabel(row('https://github.com/owner/repo/'))).toBe(
      'owner/repo',
    )
  })
})

describe('repositoryProviderLabel', () => {
  it('trusts an explicit github/gitlab provider', () => {
    expect(
      repositoryProviderLabel(providerRow('github', 'https://example.com/a/b')),
    ).toBe('GitHub')
    expect(
      repositoryProviderLabel(providerRow('gitlab', 'https://example.com/a/b')),
    ).toBe('GitLab')
  })

  it('recognizes github.com behind the generic git provider', () => {
    // The clone-URL lane stores `git` for a public repository, so the host is
    // the only tell that this is a GitHub repository.
    expect(
      repositoryProviderLabel(
        providerRow('git', 'https://github.com/owner/repo.git'),
      ),
    ).toBe('GitHub')
    expect(
      repositoryProviderLabel(providerRow('git', 'git@github.com:owner/repo.git')),
    ).toBe('GitHub')
    expect(
      repositoryProviderLabel(
        providerRow('git', 'ssh://git@github.com/owner/repo'),
      ),
    ).toBe('GitHub')
  })

  it('recognizes gitlab.com and self-hosted gitlab.* hosts', () => {
    expect(
      repositoryProviderLabel(
        providerRow('git', 'https://gitlab.com/group/project'),
      ),
    ).toBe('GitLab')
    expect(
      repositoryProviderLabel(
        providerRow('git', 'https://gitlab.example.com/group/project'),
      ),
    ).toBe('GitLab')
  })

  it('recognizes bitbucket.org and codeberg.org', () => {
    expect(
      repositoryProviderLabel(
        providerRow('git', 'https://bitbucket.org/owner/repo'),
      ),
    ).toBe('Bitbucket')
    expect(
      repositoryProviderLabel(
        providerRow('git', 'https://codeberg.org/owner/repo'),
      ),
    ).toBe('Codeberg')
  })

  it('falls back to Git for unknown hosts and unparseable URLs', () => {
    expect(
      repositoryProviderLabel(providerRow('git', 'https://gitea.lan:3000/a/b')),
    ).toBe('Git')
    expect(repositoryProviderLabel(providerRow('git', 'owner'))).toBe('Git')
    expect(repositoryProviderLabel(providerRow('git', ''))).toBe('Git')
  })

  it('ignores user and port when matching the host', () => {
    expect(
      repositoryProviderLabel(
        providerRow('git', 'ssh://git@github.com:2222/owner/repo'),
      ),
    ).toBe('GitHub')
  })
})

describe('repositoryAccessLabel', () => {
  it('reads a deploy key as private', () => {
    expect(
      repositoryAccessLabel({ connectionId: null, secretId: 'sec_1' }),
    ).toBe('Private')
  })

  it('reads no credential at all as public (anonymous clone)', () => {
    expect(repositoryAccessLabel({ connectionId: null, secretId: null })).toBe(
      'Public',
    )
  })

  it('answers null for a connection row — visibility is not recorded there', () => {
    expect(
      repositoryAccessLabel({ connectionId: 'conn_1', secretId: null }),
    ).toBeNull()
  })
})
