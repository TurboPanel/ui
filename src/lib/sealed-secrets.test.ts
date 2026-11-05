import { describe, expect, it } from 'vitest'
import {
  CLEAR_SEALING_KEY_REFUSED_CONNECTED,
  clearSealingKeyError,
  sealedSecretsStatus,
  sealingKeyConfirmName,
} from './sealed-secrets'

describe('sealingKeyConfirmName', () => {
  it('asks for the name, then the hostname, then the id, as the control plane checks', () => {
    expect(sealingKeyConfirmName({ id: 'srv-1', name: 'web-1', hostname: 'web.example.com' })).toBe(
      'web-1'
    )
    expect(sealingKeyConfirmName({ id: 'srv-1', name: ' ', hostname: 'web.example.com' })).toBe(
      'web.example.com'
    )
    expect(sealingKeyConfirmName({ id: 'srv-1', name: null })).toBe('srv-1')
  })
})

describe('sealedSecretsStatus', () => {
  it('pairs a word with the tone', () => {
    expect(sealedSecretsStatus({ receivesPlaintext: false })).toEqual({
      label: 'Sealed',
      tone: 'ok',
    })
    expect(sealedSecretsStatus({ receivesPlaintext: true })).toEqual({
      label: 'Unsealed',
      tone: 'pending',
    })
  })
})

describe('clearSealingKeyError', () => {
  it('says a connected current daemon keeps its key', () => {
    const err = new Error(
      '/api/admin/v1/instance/identity/sealed-secrets/x/key failed: HTTP 409: daemon_seals_secrets'
    )
    expect(clearSealingKeyError(err)).toBe(CLEAR_SEALING_KEY_REFUSED_CONNECTED)
  })

  it('asks for the exact name on a name refusal', () => {
    const err = new Error('/x failed: HTTP 400: confirm_name_required')
    expect(clearSealingKeyError(err)).toBe('Type the server name exactly as shown.')
  })
})
