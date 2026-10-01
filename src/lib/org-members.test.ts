import { describe, expect, it } from 'vitest'
import {
  LEAVE_CONFIRM_COPY,
  countOwners,
  formatJoined,
  memberAction,
  memberDisplayName,
  removeConfirmCopy,
  roleTone,
  type MemberActionInput,
} from '@/lib/org-members'

const base: MemberActionInput = {
  viewerId: 'me',
  viewerCanManage: true,
  viewerIsOwner: false,
  member: { id: 'them', role: 'member' },
  ownerCount: 2,
}

const ask = (patch: Partial<MemberActionInput>) => memberAction({ ...base, ...patch })

describe('memberAction', () => {
  it('lets an owner or manager remove a plain member or a manager', () => {
    expect(ask({})).toBe('remove')
    expect(ask({ viewerIsOwner: true, member: { id: 'them', role: 'manager' } })).toBe('remove')
  })

  it('offers Leave on your own row', () => {
    expect(ask({ member: { id: 'me', role: 'member' } })).toBe('leave')
    expect(ask({ member: { id: 'me', role: 'owner' }, viewerIsOwner: true })).toBe('leave')
  })

  it('hides Remove on an owner for a manager but not for an owner', () => {
    expect(ask({ member: { id: 'them', role: 'owner' } })).toBeNull()
    expect(ask({ member: { id: 'them', role: 'owner' }, viewerIsOwner: true })).toBe('remove')
  })

  it('hides everything on the last owner, including leaving', () => {
    const last = { id: 'them', role: 'owner' as const }
    expect(ask({ member: last, ownerCount: 1, viewerIsOwner: true })).toBeNull()
    expect(
      ask({ member: { id: 'me', role: 'owner' }, ownerCount: 1, viewerIsOwner: true })
    ).toBeNull()
  })

  it('offers nothing on other rows to someone who cannot manage', () => {
    expect(ask({ viewerCanManage: false })).toBeNull()
    expect(ask({ viewerCanManage: false, member: { id: 'me', role: 'member' } })).toBe('leave')
  })

  it('offers nothing when the viewer is unknown', () => {
    expect(ask({ viewerId: null, viewerCanManage: false })).toBeNull()
  })
})

describe('member display helpers', () => {
  it('counts owners', () => {
    expect(countOwners([{ role: 'owner' }, { role: 'manager' }, { role: 'owner' }])).toBe(2)
  })

  it('names the person in the confirmation', () => {
    const copy = removeConfirmCopy({ name: 'Ada Lovelace', email: 'ada@example.com' })
    expect(copy.confirmLabel).toBe('Remove Ada Lovelace')
    expect(copy.prompt).toContain('Ada Lovelace')
    expect(removeConfirmCopy({ name: ' ', email: 'ada@example.com' }).confirmLabel).toBe(
      'Remove ada@example.com'
    )
    expect(LEAVE_CONFIRM_COPY.confirmLabel).toBe('Leave organization')
  })

  it('falls back to the email, tones roles, and tolerates a bad date', () => {
    expect(memberDisplayName({ name: null, email: 'a@b.c' })).toBe('a@b.c')
    expect(roleTone('owner')).toBe('ok')
    expect(roleTone('member')).toBe('muted')
    expect(formatJoined('nope')).toBe('')
    expect(formatJoined('2026-01-02T00:00:00.000Z')).toMatch(/^Joined /)
  })
})
