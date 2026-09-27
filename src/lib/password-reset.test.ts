import { describe, expect, it } from 'vitest'
import { resetLinkState } from './password-reset'

const TOKEN = 'a'.repeat(64)

describe('resetLinkState', () => {
  it('is ready with a well-formed token', () => {
    expect(resetLinkState({ token: TOKEN })).toEqual({ kind: 'ready', token: TOKEN })
    expect(resetLinkState({ token: [TOKEN, 'x'] })).toEqual({ kind: 'ready', token: TOKEN })
  })

  it('is invalid when the link redirect reported an error', () => {
    expect(resetLinkState({ token: TOKEN, error: 'INVALID_TOKEN' })).toEqual({ kind: 'invalid' })
  })

  it('is invalid without a token or with a malformed one', () => {
    expect(resetLinkState({})).toEqual({ kind: 'invalid' })
    expect(resetLinkState({ token: 'abc' })).toEqual({ kind: 'invalid' })
    expect(resetLinkState({ token: 'Z'.repeat(64) })).toEqual({ kind: 'invalid' })
  })
})
