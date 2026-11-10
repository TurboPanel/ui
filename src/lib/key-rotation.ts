import { base64urlToBytes, bytesToBase64url } from '@/lib/base64url'
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
  'These servers have not learned the rotation passkeys yet, or have not reported them. They pick them up on their next daily check once their daemon is up to date; a server that never does needs a fresh install command after a key change.'

export const CANCEL_WAITING_HELP =
  'Cancel only if the rotation command stopped before it stored the new key. If the command said the key was stored, keep waiting: cancelling then would cut every server off.'

export const MARK_ONLY_OWN_HELP =
  'You can mark your own sign-in passkeys. Add a passkey in your account settings on this hostname first if you need another one.'

const STATEMENT_UNREADABLE = 'The prepared change could not be read. Do not approve it.'
const STATEMENT_MISMATCH =
  'The prepared change does not match what the control plane described. Do not approve it.'
const STATEMENT_OTHER_KEY =
  'The prepared change is not for the key in your link. Do not approve it.'

async function sha256Base64url(bytes: Uint8Array): Promise<string> {
  return bytesToBase64url(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
}

/** What the statement bytes themselves say: the passkey signs these bytes, nothing else. */
export type StatementFacts = Readonly<{
  /** The WebAuthn challenge: base64url SHA-256 of the exact bytes. */
  challenge: string
  keyset: number
  kind: KeysetStatementKind
  oldFingerprint: string
  /** Computed here from the new key in the statement, not copied from its label. */
  newFingerprint: string
  /** The new key itself (base64url), as the rotation command's link carries it. */
  newKey: string
}>

/**
 * Read a prepared statement from its bytes in this browser: the challenge the
 * passkey will sign and the keys it names. Throws when the bytes are not a
 * statement, or when the new key does not hash to the fingerprint beside it.
 */
export async function readStatementFacts(statement: string): Promise<StatementFacts> {
  let bytes: Uint8Array
  let doc: Record<string, unknown>
  try {
    bytes = base64urlToBytes(statement)
    doc = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new TypeError(STATEMENT_UNREADABLE)
  }
  const current = (doc?.current ?? {}) as Record<string, unknown>
  const { keyset, kind, prev } = doc ?? {}
  if (
    typeof keyset !== 'number' ||
    !Number.isSafeInteger(keyset) ||
    (kind !== 'rotate' && kind !== 'revoke' && kind !== 'passkeys') ||
    typeof prev !== 'string' ||
    typeof current.kid !== 'string' ||
    typeof current.pub !== 'string'
  ) {
    throw new TypeError(STATEMENT_UNREADABLE)
  }
  let newFingerprint: string
  try {
    newFingerprint = await sha256Base64url(base64urlToBytes(current.pub))
  } catch {
    throw new TypeError(STATEMENT_UNREADABLE)
  }
  if (newFingerprint !== current.kid) throw new TypeError(STATEMENT_UNREADABLE)
  return {
    challenge: await sha256Base64url(bytes),
    keyset,
    kind,
    oldFingerprint: prev,
    newFingerprint,
    newKey: current.pub,
  }
}

/**
 * The prepared statement with everything the screen shows and the passkey
 * signs taken from its bytes. Refuses a statement that is not what was asked
 * for, or that the control plane described differently from what it says.
 */
export async function checkPreparedStatement(
  prepared: PreparedKeysetStatement,
  request: KeysetChangeRequest
): Promise<PreparedKeysetStatement> {
  const facts = await readStatementFacts(prepared.statement)
  if (
    facts.kind !== request.kind ||
    facts.kind !== prepared.kind ||
    facts.keyset !== prepared.keyset ||
    facts.oldFingerprint !== prepared.oldFingerprint ||
    facts.newFingerprint !== prepared.newFingerprint ||
    facts.challenge !== prepared.challenge
  ) {
    throw new TypeError(STATEMENT_MISMATCH)
  }
  if (request.newKey !== undefined && request.newKey !== facts.newKey) {
    throw new TypeError(STATEMENT_OTHER_KEY)
  }
  const keeps = facts.newFingerprint === facts.oldFingerprint
  if (facts.kind === 'passkeys' ? !keeps : keeps) throw new TypeError(STATEMENT_MISMATCH)
  return {
    ...prepared,
    challenge: facts.challenge,
    keyset: facts.keyset,
    kind: facts.kind,
    oldFingerprint: facts.oldFingerprint,
    newFingerprint: facts.newFingerprint,
  }
}

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
