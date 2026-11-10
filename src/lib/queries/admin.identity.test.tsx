// @vitest-environment happy-dom
import { type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createAppQueryClient } from '../query-client'
import { queryKeys } from '../query-keys'
import {
  useClearServerSealingKey,
  useInstanceIdentity,
  useApproveKeysetStatement,
  useCancelWaitingKeyChange,
  usePrepareKeysetStatement,
  useSealedSecrets,
} from './admin'

const {
  fetchInstanceIdentity,
  approveKeysetStatement,
  prepareKeysetStatement,
  cancelWaitingKeyChange,
  fetchSealedSecrets,
  clearServerSealingKey,
  loginWithPasskey,
} = vi.hoisted(() => ({
  prepareKeysetStatement: vi.fn(),
  cancelWaitingKeyChange: vi.fn(),
  fetchInstanceIdentity: vi.fn(),
  approveKeysetStatement: vi.fn(),
  fetchSealedSecrets: vi.fn(),
  clearServerSealingKey: vi.fn(),
  loginWithPasskey: vi.fn(),
}))

vi.mock('../passkey-client', () => ({ loginWithPasskey }))

vi.mock('../instance-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../instance-api')>()
  return {
    ...actual,
    fetchInstanceIdentity,
    approveKeysetStatement,
    prepareKeysetStatement,
    cancelWaitingKeyChange,
    fetchSealedSecrets,
    clearServerSealingKey,
  }
})

function setup() {
  const queryClient = createAppQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('control plane identity hooks', () => {
  it('useInstanceIdentity reads the identity under its key', async () => {
    fetchInstanceIdentity.mockResolvedValue({ ok: true, configured: true })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useInstanceIdentity(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(queryKeys.admin.instanceIdentity)).toEqual({
      ok: true,
      configured: true,
    })
  })

  it('useInstanceIdentity stays idle when disabled', () => {
    fetchInstanceIdentity.mockClear()
    const { wrapper } = setup()
    renderHook(() => useInstanceIdentity({ enabled: false }), { wrapper })
    expect(fetchInstanceIdentity).not.toHaveBeenCalled()
  })

  it('preparing refuses a statement whose bytes are not what the control plane described', async () => {
    const pub = new Uint8Array(32).fill(2)
    const b64 = (bytes: ArrayBuffer | Uint8Array) =>
      btoa(String.fromCodePoint(...new Uint8Array(bytes)))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '')
    const hash = async (bytes: Uint8Array) =>
      b64(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
    const newFingerprint = await hash(pub)
    const oldFingerprint = 'O'.repeat(43)
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        keyset: 5,
        prev: oldFingerprint,
        kind: 'rotate',
        current: { kid: newFingerprint, pub: b64(pub) },
      })
    )
    const honest = {
      ok: true,
      statement: b64(bytes),
      challenge: await hash(bytes),
      rpId: 'cp.example.com',
      keyset: 5,
      kind: 'rotate',
      oldFingerprint,
      newFingerprint,
      approverCredentialIds: ['m1'],
      possessionCredentialIds: [],
    }
    const { wrapper } = setup()
    const { result } = renderHook(() => usePrepareKeysetStatement(), { wrapper })

    prepareKeysetStatement.mockResolvedValueOnce(honest)
    let outcome = await act(async () => await result.current.run({ kind: 'rotate' }))
    expect(outcome.ok).toBe(true)

    // The summary names another new key than the bytes the passkey would sign.
    prepareKeysetStatement.mockResolvedValueOnce({ ...honest, newFingerprint: 'F'.repeat(43) })
    outcome = await act(async () => await result.current.run({ kind: 'rotate' }))
    expect(outcome).toMatchObject({ ok: false, error: expect.stringMatching(/Do not approve it/) })
  })

  it('cancelling a waiting change refreshes the rotation and identity reads', async () => {
    cancelWaitingKeyChange.mockResolvedValue({ ok: true, keyset: 3, cancelled: true })
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useCancelWaitingKeyChange(), { wrapper })
    const outcome = await act(async () => await result.current.run(3))
    expect(outcome.ok).toBe(true)
    expect(cancelWaitingKeyChange.mock.calls[0]?.[0]).toBe(3)
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      queryKeys.admin.keyRotation,
      queryKeys.admin.instanceIdentity,
    ])
  })

  it('approving runs one passkey ceremony per step, then sends the approvals', async () => {
    const assertion = (rawId: string) => ({
      supported: true,
      credential: {
        rawId,
        response: { authenticatorData: 'AD', clientDataJSON: 'CD', signature: 'SG' },
      },
    })
    loginWithPasskey.mockResolvedValueOnce(assertion('approver'))
    loginWithPasskey.mockResolvedValueOnce(assertion('new-one'))
    approveKeysetStatement.mockResolvedValue({
      ok: true,
      keyset: 4,
      kind: 'passkeys',
      state: 'live',
    })
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useApproveKeysetStatement(), { wrapper })
    await act(async () => {
      await result.current.run({
        ok: true,
        statement: 'ST',
        challenge: 'CH',
        rpId: 'cp.example.com',
        keyset: 4,
        kind: 'passkeys',
        oldFingerprint: 'O'.repeat(43),
        newFingerprint: 'O'.repeat(43),
        approverCredentialIds: ['approver'],
        possessionCredentialIds: ['new-one'],
      })
    })
    expect(loginWithPasskey.mock.calls.map(([options]) => options.allowCredentials)).toEqual([
      [{ id: 'approver', type: 'public-key' }],
      [{ id: 'new-one', type: 'public-key' }],
    ])
    expect(approveKeysetStatement.mock.calls[0]?.[0]).toEqual({
      statement: 'ST',
      approvals: [
        {
          credentialId: 'approver',
          authenticatorData: 'AD',
          clientDataJSON: 'CD',
          signature: 'SG',
        },
        { credentialId: 'new-one', authenticatorData: 'AD', clientDataJSON: 'CD', signature: 'SG' },
      ],
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.instanceIdentity })
  })

  it('useSealedSecrets reads the list under its key, and stays idle when disabled', async () => {
    fetchSealedSecrets.mockResolvedValue({ ok: true, receivingPlaintext: 0, servers: [] })
    const { queryClient, wrapper } = setup()
    const { result } = renderHook(() => useSealedSecrets(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(queryClient.getQueryData(queryKeys.admin.sealedSecrets)).toEqual({
      ok: true,
      receivingPlaintext: 0,
      servers: [],
    })
    fetchSealedSecrets.mockClear()
    renderHook(() => useSealedSecrets({ enabled: false }), { wrapper: setup().wrapper })
    expect(fetchSealedSecrets).not.toHaveBeenCalled()
  })

  it('clearing a sealing key sends the typed name and refreshes the list', async () => {
    clearServerSealingKey.mockResolvedValue({ ok: true, cleared: true })
    const { queryClient, wrapper } = setup()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useClearServerSealingKey(), { wrapper })
    await act(async () => {
      await result.current.run({ serverId: 'srv-1', confirmName: 'web-1' })
    })
    expect(clearServerSealingKey).toHaveBeenCalledWith('srv-1', 'web-1')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.admin.sealedSecrets })
  })
})
