import { describe, expect, it } from 'vitest'
import {
  acceptInvitationPath,
  safeAuthReturnPath,
  signInForInvitationHref,
  signInWithReturnHref,
} from './invitation-return'

describe('safeAuthReturnPath', () => {
  it('accepts a same-origin relative path', () => {
    expect(safeAuthReturnPath('/accept-invitation?id=abc')).toBe(
      '/accept-invitation?id=abc',
    )
  })

  it('rejects empty, protocol-relative, and absolute URLs', () => {
    expect(safeAuthReturnPath(undefined)).toBeNull()
    expect(safeAuthReturnPath('')).toBeNull()
    expect(safeAuthReturnPath('   ')).toBeNull()
    expect(safeAuthReturnPath('https://evil.example/phish')).toBeNull()
    expect(safeAuthReturnPath('//evil.example/phish')).toBeNull()
    expect(safeAuthReturnPath('/accept-invitation\\id=abc')).toBeNull()
    expect(safeAuthReturnPath('accept-invitation')).toBeNull()
  })
})

describe('invitation return hrefs', () => {
  it('builds accept and sign-in return targets from the invitation id', () => {
    const invitationId = '11111111-1111-4111-8111-111111111111'
    const acceptPath = acceptInvitationPath(invitationId)
    expect(acceptPath).toBe(`/accept-invitation?id=${invitationId}`)
    expect(signInWithReturnHref(acceptPath)).toBe(
      `/sign-in?redirectTo=${encodeURIComponent(acceptPath)}`,
    )
    expect(signInForInvitationHref(invitationId)).toBe(
      `/sign-in?redirectTo=${encodeURIComponent(acceptPath)}`,
    )
  })
})
