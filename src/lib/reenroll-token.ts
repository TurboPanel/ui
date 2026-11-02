const MINUTE_MS = 60_000

/** `Expires in 59 minutes` / `Expires in less than a minute` / `Expired`. */
export function reenrollExpiryLabel(expiresAt: string, nowMs: number = Date.now()): string {
  const at = Date.parse(expiresAt)
  if (!Number.isFinite(at) || at <= nowMs) return 'Expired'
  const minutes = Math.floor((at - nowMs) / MINUTE_MS)
  if (minutes < 1) return 'Expires in less than a minute'
  return minutes === 1 ? 'Expires in 1 minute' : `Expires in ${minutes} minutes`
}

/** Whether a ticket can still be used (and so still be revoked). */
export function reenrollTokenIsLive(expiresAt: string, nowMs: number = Date.now()): boolean {
  const at = Date.parse(expiresAt)
  return Number.isFinite(at) && at > nowMs
}

/**
 * What to show as the command. A control plane that predates `installCommand`
 * returns only the installer value, so name it instead of guessing the rest.
 */
export function reenrollCommandText(ticket: {
  installCommand?: string
  licenseArg: string
}): string {
  return ticket.installCommand ?? `TURBOPANEL_LICENSE=${ticket.licenseArg}`
}

export const REENROLL_TOKEN_HELP =
  'Use this when a server lost its key and cannot connect. Run the command as root on that server. It works once and stops working after one hour. Issuing a new token replaces any earlier unused one.'
