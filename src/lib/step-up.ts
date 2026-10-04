import { isTwoFactorCodeComplete, normalizeTwoFactorCode } from '@/lib/two-factor-prompt'

/**
 * Step-up re-authentication, the client half.
 *
 * When an organization has turned on "ask again before permanent actions", a
 * permanent action answers `403 { error: 'reauth_required', action, methods }`
 * until the signed-in person proves who they are again. `fetchWithStepUp`
 * (used by every request in `instance-api.ts`) catches that answer, asks the
 * mounted `ReauthSheet` for a proof through the broker below, and sends the
 * original request once more when it succeeds. Cancelling hands the caller the
 * original refusal, so a screen shows the same error it always did.
 */

/** How a person can prove themselves: an authenticator code, a password, or only by signing in again. */
export type StepUpMethod = 'password' | 'totp' | 'signin'

export type StepUpChallenge = Readonly<{
  /** Registry key from the server (`project.delete`, ...), or `null` when absent. */
  action: string | null
  methods: readonly StepUpMethod[]
}>

const KNOWN_METHODS: ReadonlySet<string> = new Set<StepUpMethod>(['password', 'totp', 'signin'])

function isStepUpMethod(value: unknown): value is StepUpMethod {
  return typeof value === 'string' && KNOWN_METHODS.has(value)
}

/** What the sheet says the person is about to do, in app vocabulary. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  'project.delete': 'delete this project',
  'environment.delete': 'delete this environment',
  'server.delete': 'delete this server',
  'server.daemon_key.revoke': "revoke this server's key",
  'license.revoke': 'revoke this license key',
  'managed.delete': 'delete this managed database',
  'managed.database.delete': 'delete this database',
  'member.remove': 'remove this member',
}

export function stepUpActionLabel(action: string | null): string {
  return (action ? ACTION_LABELS[action] : undefined) ?? 'do this'
}

/**
 * Read a refusal body. Anything that is not the `reauth_required` answer is
 * `null`, so a plain permission 403 is never mistaken for a prompt.
 */
export function parseStepUpChallenge(status: number, body: unknown): StepUpChallenge | null {
  if (status !== 403 || typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  if (record.error !== 'reauth_required') return null
  const methods = Array.isArray(record.methods) ? record.methods.filter(isStepUpMethod) : []
  return {
    action: typeof record.action === 'string' ? record.action : null,
    methods: methods.length > 0 ? methods : ['password'],
  }
}

/** The one proof to ask for: an authenticator code beats a password; neither means sign in again. */
export function stepUpMethodToAsk(methods: readonly StepUpMethod[]): StepUpMethod {
  if (methods.includes('totp')) return 'totp'
  if (methods.includes('password')) return 'password'
  return 'signin'
}

export const STEP_UP_COPY: Readonly<
  Record<'password' | 'totp', { label: string; prompt: string }>
> = {
  password: {
    label: 'Password',
    prompt: 'Enter your password to confirm it is you.',
  },
  totp: {
    label: 'Authentication code',
    prompt: 'Enter the 6-digit code from your authenticator app to confirm it is you.',
  },
}

export const STEP_UP_SIGN_IN_AGAIN_COPY =
  'Sign in again to confirm it is you, then repeat this action.'

/** True when the typed value is worth sending (a short code should not spend an attempt). */
export function canSubmitStepUp(method: 'password' | 'totp', value: string): boolean {
  if (method === 'totp') return isTwoFactorCodeComplete(value, 'totp')
  return value.length > 0
}

/** The `POST /auth/reauth` body for one proof. */
export function stepUpRequestBody(
  method: 'password' | 'totp',
  value: string
): { password: string } | { code: string } {
  return method === 'totp' ? { code: normalizeTwoFactorCode(value, 'totp') } : { password: value }
}

/** What to tell the person when `POST /auth/reauth` refuses. */
export function reauthFailureMessage(status: number): string {
  if (status === 429) return 'Too many attempts. Wait a minute and try again.'
  if (status === 403) return 'That did not match. Try again.'
  if (status === 401) return 'You were signed out. Sign in again.'
  return 'Could not confirm it is you. Try again.'
}

type Settle = (proved: boolean) => void

/**
 * Hand-off between the request layer and the sheet. One prompt at a time:
 * requests that are refused while it is open share the same answer, so three
 * parallel deletes ask once.
 */
export type StepUpBroker = Readonly<{
  /** Resolves `true` once a proof is accepted, `false` when cancelled or no sheet is mounted. */
  request: (challenge: StepUpChallenge) => Promise<boolean>
  /** Called by the sheet; returns what it must call to unsubscribe. */
  subscribe: (listener: (challenge: StepUpChallenge | null) => void) => () => void
  /** Called by the sheet when the person proved themselves (`true`) or gave up (`false`). */
  settle: (proved: boolean) => void
}>

export function createStepUpBroker(): StepUpBroker {
  let listener: ((challenge: StepUpChallenge | null) => void) | null = null
  let pending: { promise: Promise<boolean>; settle: Settle } | null = null

  const settle: Settle = (proved) => {
    const current = pending
    pending = null
    listener?.(null)
    current?.settle(proved)
  }

  return {
    request(challenge) {
      if (!listener) return Promise.resolve(false)
      if (pending) return pending.promise
      let resolve: Settle = () => {}
      const promise = new Promise<boolean>((done) => {
        resolve = done
      })
      pending = { promise, settle: resolve }
      listener(challenge)
      return promise
    },
    subscribe(next) {
      listener = next
      return () => {
        if (listener === next) {
          listener = null
          settle(false)
        }
      }
    },
    settle,
  }
}

/** The app-wide broker the mounted `ReauthSheet` subscribes to. */
export const stepUpBroker: StepUpBroker = createStepUpBroker()

async function readChallenge(response: Response): Promise<StepUpChallenge | null> {
  if (response.status !== 403) return null
  try {
    return parseStepUpChallenge(response.status, await response.clone().json())
  } catch {
    return null
  }
}

/**
 * `fetch` that answers a `reauth_required` refusal by asking for a proof and
 * retrying the same request once. Bodies are strings or form data, so the
 * request can be sent again as it was. Without a proof the caller gets the
 * original refusal; a second refusal is returned as is (no loop).
 */
export async function fetchWithStepUp(
  input: string,
  init?: RequestInit,
  broker: StepUpBroker = stepUpBroker
): Promise<Response> {
  const response = await fetch(input, init)
  const challenge = await readChallenge(response)
  if (!challenge) return response
  const proved = await broker.request(challenge)
  return proved ? await fetch(input, init) : response
}
