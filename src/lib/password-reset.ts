/**
 * What the reset-password page was opened with. The control plane's link
 * redirect lands here with `?token=<64 hex>` for a live link, or
 * `?error=INVALID_TOKEN` for an unknown, used or expired one (better-auth).
 */
export type ResetLinkState = { kind: 'ready'; token: string } | { kind: 'invalid' }

const RESET_TOKEN_PATTERN = /^[0-9a-f]{64}$/

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return (value[0] ?? '').trim()
  return (value ?? '').trim()
}

export function resetLinkState(params: {
  token?: string | string[]
  error?: string | string[]
}): ResetLinkState {
  if (firstParam(params.error)) return { kind: 'invalid' }
  const token = firstParam(params.token)
  return RESET_TOKEN_PATTERN.test(token) ? { kind: 'ready', token } : { kind: 'invalid' }
}
