import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import type { ProjectComposeSource } from '@/lib/instance-api'
import {
  baseUsedLine,
  composeSourceForCreate,
  environmentBranchRows,
  followingNote,
  isFollowingRepository,
  baseEditBlockedMessage,
  shortCommit,
} from './compose-source'
import { sha256Hex } from './sha256'

const SOURCE_UUID = '11111111-2222-4333-8444-555555555555'

const SOURCE: ProjectComposeSource = {
  sourceId: 'src-1',
  path: 'deploy/compose.yaml',
  seededCommitSha: 'aaaaaaa1111111111111111111111111111111aa',
  seededDigest: '0'.repeat(64),
  mode: 'track',
}

describe('isFollowingRepository', () => {
  it('is true only in track mode', () => {
    expect(isFollowingRepository({ options: { composeSource: SOURCE } })).toBe(true)
    expect(isFollowingRepository({ options: { composeSource: { ...SOURCE, mode: 'seed' } } })).toBe(
      false
    )
    expect(
      isFollowingRepository({ options: { composeSource: { ...SOURCE, mode: undefined } } })
    ).toBe(false)
    expect(isFollowingRepository({ options: null })).toBe(false)
    expect(isFollowingRepository(null)).toBe(false)
  })
})

describe('followingNote', () => {
  it('names the file, the branch and the short commit of the last read', () => {
    const note = followingNote({
      ...SOURCE,
      ref: 'refs/heads/live',
      lastReadCommitSha: 'bbbbbbb2222222222222222222222222222222bb',
    })
    expect(note).toBe('Following deploy/compose.yaml on live; last read at bbbbbbb')
  })

  it('falls back to the seeded commit and the repository default branch', () => {
    expect(followingNote(SOURCE, { defaultBranch: 'main' })).toBe(
      'Following deploy/compose.yaml on main; last read at aaaaaaa'
    )
  })

  it('says "in the repository" when no branch is known', () => {
    expect(followingNote(SOURCE)).toBe(
      'Following deploy/compose.yaml in the repository; last read at aaaaaaa'
    )
  })

  it('adds the time of the last read from lastReadAt', () => {
    const note = followingNote({ ...SOURCE, lastReadAt: '2026-01-01T00:00:00.000Z' })
    expect(
      note.startsWith('Following deploy/compose.yaml in the repository; last read at aaaaaaa ')
    ).toBe(true)
    expect(note.length).toBeGreaterThan(70)
  })
})

describe('baseUsedLine and shortCommit', () => {
  it('shortens the commit to seven characters', () => {
    expect(shortCommit('0123456789abcdef')).toBe('0123456')
    expect(
      baseUsedLine({
        sourceId: 's',
        ref: 'main',
        path: 'compose.yaml',
        commitSha: '0123456789abcdef',
        digest: 'x',
      })
    ).toBe('Base from compose.yaml at 0123456 (main)')
  })
})

describe('baseEditBlockedMessage', () => {
  it('blocks a Base edit only while following', () => {
    expect(baseEditBlockedMessage({ options: { composeSource: SOURCE } })).toContain(
      'Stop following'
    )
    expect(
      baseEditBlockedMessage({ options: { composeSource: { ...SOURCE, mode: 'seed' } } })
    ).toBeNull()
    expect(baseEditBlockedMessage({ options: {} })).toBeNull()
  })
})

describe('composeSourceForCreate', () => {
  it('records the branch, commit and the digest of the exact bytes', () => {
    const body = 'services:\n  web:\n    image: nginx\n'
    expect(
      composeSourceForCreate({
        sourceId: 'src-1',
        branch: 'refs/heads/main',
        path: 'compose.yaml',
        commitSha: 'e'.repeat(40),
        content: body,
      })
    ).toEqual({
      sourceId: 'src-1',
      ref: 'main',
      path: 'compose.yaml',
      seededCommitSha: 'e'.repeat(40),
      seededDigest: sha256Hex(body),
    })
  })

  it('leaves the branch out when none was typed', () => {
    const made = composeSourceForCreate({
      sourceId: 's',
      branch: '  ',
      path: 'compose.yaml',
      commitSha: 'e'.repeat(40),
      content: 'x',
    })
    expect('ref' in made).toBe(false)
  })
})

describe('environmentBranchRows', () => {
  const doc = (branch?: string): ComposeDocument => ({
    version: 1,
    data: {
      services: {
        web: {
          'x-turbopanel': {
            serviceKind: 'node',
            source: { sourceId: SOURCE_UUID, ...(branch ? { branch } : {}) },
          },
        },
      },
    },
    presentation: { keyOrder: ['services'], comments: {} },
  })

  it('lists environments that override the branch, not those that inherit it', () => {
    const rows = environmentBranchRows(
      { options: { compose: doc('main') } },
      [
        { id: 'e1', name: 'staging', options: { compose: doc('staging') } },
        { id: 'e2', name: 'production', options: null },
      ],
      SOURCE_UUID,
      'main'
    )
    expect(rows).toEqual([{ id: 'e1', name: 'staging', branch: 'staging' }])
  })

  it('skips an override that names the project branch', () => {
    const rows = environmentBranchRows(
      { options: { compose: doc('main') } },
      [{ id: 'e1', name: 'staging', options: { compose: doc('main') } }],
      SOURCE_UUID,
      'main'
    )
    expect(rows).toEqual([])
  })
})
