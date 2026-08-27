import { describe, expect, it } from 'vitest'
import type { RepositoryRecord } from '@/lib/instance-api'
import { repositoryLabel } from '@/lib/repository-label'

function row(repositoryUrl: string): RepositoryRecord {
  return { repositoryUrl } as RepositoryRecord
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
