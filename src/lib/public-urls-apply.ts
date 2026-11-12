/**
 * Operator-facing copy for the Save & Apply lifecycle in Admin › Access ›
 * Hostnames, kept out of the component so each state can be asserted directly.
 *
 * Applying reloads Caddy with a freshly issued certificate, which routinely
 * kills the request that asked for it (`control-plane-recovery.ts`). Three of
 * these states exist only because of that, and each says something different:
 * `reconnecting` (the connection dropped, we are waiting), `reconnected` (it
 * came back and the change is there), `unreachable` (it did not come back in
 * time). Collapsing them into "failed" is what made this page look broken when
 * the apply had in fact succeeded.
 */

export type PublicUrlsApplyStatus =
  | 'idle'
  | 'applying'
  | 'reconnecting'
  | 'applied'
  | 'reconnected'
  | 'reconnected-trusted'
  | 'reconnected-mixed'
  | 'reconnected-kept'
  | 'not-saved'
  | 'unreachable'
  | 'failed'

export type PublicUrlsApplyTone = 'pending' | 'done' | 'failed'

export type PublicUrlsApplyFeedback = Readonly<{
  tone: PublicUrlsApplyTone
  message: string
}> | null

const FEEDBACK: Record<
  Exclude<PublicUrlsApplyStatus, 'idle' | 'failed'>,
  Readonly<{ tone: PublicUrlsApplyTone; message: string }>
> = {
  applying: {
    tone: 'pending',
    message:
      'Applying. The control plane reloads Caddy with a new certificate, so this page may stop responding for a few seconds.',
  },
  reconnecting: {
    tone: 'pending',
    message: 'The control plane restarted during the request. Waiting for it to respond again…',
  },
  applied: {
    tone: 'done',
    message: 'Applied. The certificate was regenerated and Caddy reloaded.',
  },
  reconnected: {
    tone: 'done',
    message:
      'Applied. The control plane now serves the new certificate. A self-signed certificate still triggers a browser warning on this address; use a hostname with a public certificate, or trust the Platform CA, to avoid it.',
  },
  'reconnected-trusted': {
    tone: 'done',
    message: 'Applied. The control plane is back and its certificate is in place.',
  },
  'reconnected-mixed': {
    tone: 'done',
    message:
      'Applied. The control plane is back. Names that use the Platform CA still trigger a browser warning; trust the Platform CA, or use a public certificate, to avoid it.',
  },
  'reconnected-kept': {
    tone: 'done',
    message:
      "The server kept its existing certificate; Let's Encrypt did not confirm a new one yet.",
  },
  'not-saved': {
    tone: 'failed',
    message:
      'The control plane is back, but the addresses it reports do not match what you applied. Apply again.',
  },
  unreachable: {
    tone: 'failed',
    message:
      'The control plane has not answered yet. It may be listening on a different address now, or the browser may be blocking its new certificate. Reload this page to check.',
  },
}

/** The one line to show under the Save & Apply row, or nothing when idle. */
export function publicUrlsApplyFeedback(
  status: PublicUrlsApplyStatus,
  error?: string | null
): PublicUrlsApplyFeedback {
  if (status === 'idle') return null
  if (status === 'failed') {
    return { tone: 'failed', message: `Apply failed: ${error ?? 'unknown error'}` }
  }
  return FEEDBACK[status]
}

/** Which kinds of certificate a hostname set asks for, in the words the banner needs. */
export function applyCertificateKind(
  hostnames: readonly { source: string }[]
): 'platform' | 'trusted' | 'mixed' {
  const platform = hostnames.filter((entry) => entry.source === 'platform-ca').length
  if (platform === hostnames.length) return 'platform'
  return platform === 0 ? 'trusted' : 'mixed'
}

const RECONNECTED_STATUS = {
  platform: 'reconnected',
  trusted: 'reconnected-trusted',
  mixed: 'reconnected-mixed',
} as const

/** The banner state for an apply that finished by way of the reconnect wait. */
export function reconnectedStatus(
  hostnames: readonly { source: string }[],
  kept = false
): PublicUrlsApplyStatus {
  if (kept) return 'reconnected-kept'
  return RECONNECTED_STATUS[applyCertificateKind(hostnames)]
}
