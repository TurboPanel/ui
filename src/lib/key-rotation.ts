import type {
  KeysetApprovalPayload,
  KeysetChangeRequest,
  KeysetStatementKind,
  PreparedKeysetStatement,
} from '@/lib/instance-api'

/**
 * Control plane key rotation: which passkey ceremonies a prepared statement
 * needs, the request options for each, and the words the screen uses. Pure,
 * so the flow is tested without a browser.
 */

export const ROTATION_PASSKEYS_HELP =
  'Marked passkeys approve a change of the control plane key. Servers trust them directly, so mark at least two, ideally one on a security key. Anyone who can use a marked passkey can approve a key change.'

export const NO_DEVICE_BOUND_WARNING =
  'None of the marked passkeys is on a security key. A synced passkey is only as safe as the account it syncs through.'

export const ROTATE_HELP =
  'Approving with a passkey lets every server trust the new key. The old key stops working on each server as soon as it sees this change.'

export const REVOKE_HELP =
  "Use this when the current key may be in someone else's hands. Servers drop the old key at once. Download the change for any server that cannot reach this control plane."

export const HA_ROTATE_HELP =
  'On High Availability the new key comes from the rotation command in your terminal. Run it, then open the link it prints and check that the new fingerprint matches.'

export const NOT_ROTATABLE_HELP =
  'These servers have not learned the rotation passkeys yet. They pick them up on their next daily check; a server that never does needs a fresh install command after a key change.'

export const MARK_ONLY_OWN_HELP =
  'You can mark your own sign-in passkeys. Add a passkey in your account settings on this hostname first if you need another one.'

/** One browser ceremony: approve with a marked passkey, or prove a passkey being marked. */
export type AssertionStep = Readonly<{
  purpose: 'approve' | 'possession'
  allowCredentials: readonly string[]
}>

/**
 * The ceremonies a prepared statement needs, in order: one approval from a
 * marked passkey (any of them), then one proof from each passkey being
 * marked. The first marks need only the proofs.
 */
export function assertionSteps(prepared: PreparedKeysetStatement): AssertionStep[] {
  const proving = new Set(prepared.possessionCredentialIds)
  const approvers = prepared.approverCredentialIds.filter((id) => !proving.has(id))
  const steps: AssertionStep[] = prepared.possessionCredentialIds.map((id) => ({
    purpose: 'possession',
    allowCredentials: [id],
  }))
  if (approvers.length > 0) steps.unshift({ purpose: 'approve', allowCredentials: approvers })
  return steps
}

/** What `navigator.credentials.get` gets (base64url fields; the passkey client converts them). */
export function assertionRequestOptions(
  prepared: PreparedKeysetStatement,
  step: AssertionStep
): Record<string, unknown> {
  return {
    challenge: prepared.challenge,
    rpId: prepared.rpId,
    allowCredentials: step.allowCredentials.map((id) => ({ id, type: 'public-key' })),
    userVerification: 'required',
    timeout: 300_000,
  }
}

function field(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value === '') {
    throw new TypeError('The passkey answer is incomplete.')
  }
  return value
}

/** A serialized assertion (`serializeAssertion`) → the approval the control plane takes. */
export function approvalFromAssertion(credential: unknown): KeysetApprovalPayload {
  if (credential === null || typeof credential !== 'object') {
    throw new TypeError('The passkey answer is incomplete.')
  }
  const record = credential as Record<string, unknown>
  const response = (record.response ?? {}) as Record<string, unknown>
  return {
    credentialId: field(record, 'rawId'),
    authenticatorData: field(response, 'authenticatorData'),
    clientDataJSON: field(response, 'clientDataJSON'),
    signature: field(response, 'signature'),
  }
}

/** `?rotate=<pub>` or `?revoke=<pub>` from the rotation command's link. */
export function rotationLinkRequest(
  params: Readonly<{ rotate?: string | string[]; revoke?: string | string[] }>
): KeysetChangeRequest | null {
  const pick = (value: string | string[] | undefined) =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null
  const rotate = pick(params.rotate)
  if (rotate) return { kind: 'rotate', newKey: rotate }
  const revoke = pick(params.revoke)
  return revoke ? { kind: 'revoke', newKey: revoke } : null
}

export function statementKindLabel(kind: KeysetStatementKind): string {
  if (kind === 'rotate') return 'Key Rotated'
  if (kind === 'revoke') return 'Key Revoked'
  return 'Passkeys Changed'
}

/** Synced or device-bound, as the passkey list says it. */
export function passkeyKindLabel(isDeviceBound: boolean): string {
  return isDeviceBound ? 'Device-Bound' : 'Synced'
}
