/**
 * Operator-facing copy for the Save & Apply lifecycle in Networking → Public
 * URLs, kept out of the component so each state can be asserted directly.
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
      'Applying… the control plane reloads Caddy with a new certificate, so this page may go quiet for a few seconds.',
  },
  reconnecting: {
    tone: 'pending',
    message:
      'The control plane restarted mid-request — waiting for it to come back…',
  },
  applied: {
    tone: 'done',
    message: 'Applied — certificate regenerated and Caddy reloaded.',
  },
  reconnected: {
    tone: 'done',
    message:
      'Applied — the control plane came back on the new certificate. If your browser warns about it, accept the new self-signed certificate.',
  },
  'not-saved': {
    tone: 'failed',
    message:
      'The control plane came back, but the addresses it has do not match what you applied. Apply again.',
  },
  unreachable: {
    tone: 'failed',
    message:
      'The control plane has not answered yet. It may be listening on a different address now, or its new certificate needs accepting — reload this page to check.',
  },
}

/** The one line to show under the Save & Apply row, or nothing when idle. */
export function publicUrlsApplyFeedback(
  status: PublicUrlsApplyStatus,
  error?: string | null,
): PublicUrlsApplyFeedback {
  if (status === 'idle') return null
  if (status === 'failed') {
    return { tone: 'failed', message: `Apply failed: ${error ?? 'unknown error'}` }
  }
  return FEEDBACK[status]
}
