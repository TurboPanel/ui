import { describe, expect, it } from 'vitest'
import * as platformEntry from './passkey-client'
import {
  isPasskeySupported,
  loginWithPasskey,
  registerPasskey,
} from './passkey-client.native'

describe('native passkey client', () => {
  it('never claims support', () => {
    expect(isPasskeySupported()).toBe(false)
  })

  it('answers unsupported for registration rather than throwing', async () => {
    expect(await registerPasskey({ challenge: 'Y2hhbGxlbmdl' })).toEqual({
      supported: false,
    })
  })

  it('answers unsupported for sign-in rather than throwing', async () => {
    expect(await loginWithPasskey({ challenge: 'Y2hhbGxlbmdl' })).toEqual({
      supported: false,
    })
  })
})

describe('platform entry', () => {
  it('resolves to the native stub when no platform suffix is applied', () => {
    expect(platformEntry.isPasskeySupported).toBe(isPasskeySupported)
    expect(platformEntry.registerPasskey).toBe(registerPasskey)
    expect(platformEntry.loginWithPasskey).toBe(loginWithPasskey)
  })
})
