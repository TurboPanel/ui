/**
 * Cloudflare accounts and their API tokens (the carrier and badge routes).
 * Pure rules and copy; the transport lives in `instance-api.ts`.
 */
import type { TunnelBadge } from '@/lib/instance-api'
import type { BadgeTone } from '@/components/ui/badge'

export const CARRIER_LIMIT = 10
export const BADGE_LIMIT = 5

const GLOBAL_KEY_COPY =
  'This looks like a Global API Key, which does not work here. Create an API Token in Cloudflare and paste that instead.'

/**
 * Checked before sending: the panel refuses a Global API Key too, but the
 * answer should not wait for a round trip. Null means the shape is fine.
 */
export function tokenProblem(raw: string): string | null {
  const token = raw.trim()
  if (token.length === 0) return 'Paste the API Token.'
  if (/\s/.test(token)) return 'An API Token has no spaces. Copy it again.'
  if (token.startsWith('cfk_') || /^[0-9a-f]{37,45}$/.test(token)) return GLOBAL_KEY_COPY
  if (token.length < 8) return 'That is too short to be an API Token.'
  return null
}

/** Who owns the token at Cloudflare, in words. */
export function tokenKindLabel(kind: string | null): string {
  if (kind === 'account') return 'Account-owned'
  if (kind === 'user') return 'User-owned'
  return 'Owner not reported'
}

export function statusLabel(status: string): string {
  return status === 'active' ? 'Working' : 'Needs Attention'
}

export function statusTone(status: string): BadgeTone {
  return status === 'active' ? 'ok' : 'danger'
}

/** What the token can do, as one calm sentence. */
export function capabilitySummary(badge: Pick<TunnelBadge, 'capabilities'>): string {
  const { tunnels, dns, certificates } = badge.capabilities
  const parts: string[] = []
  parts.push(tunnels ? 'Can manage tunnels' : 'Cannot manage tunnels')
  if (dns.length > 0) parts.push(`DNS for ${zoneNames(dns)}`)
  if (certificates.length > 0) parts.push(`certificates for ${zoneNames(certificates)}`)
  return parts.join('; ')
}

function zoneNames(zones: readonly { name: string }[]): string {
  return zones.map((z) => z.name).join(', ')
}

/** "Checked 3 Nov 2026, 14:05", or a plain note when it never was. */
export function checkedLabel(iso: string | null): string {
  if (!iso) return 'Not checked yet'
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return 'Not checked yet'
  return `Checked ${when.toLocaleString()}`
}

/** "Expires 3 Nov 2026", or null when Cloudflare reports no expiry. */
export function expiryLabel(iso: string | null): string | null {
  if (!iso) return null
  const when = new Date(iso)
  if (Number.isNaN(when.getTime())) return null
  return `Expires ${when.toLocaleDateString()}`
}

const ERROR_COPY: Readonly<Record<string, string>> = {
  carrier_in_use: 'This account still has tunnels. Remove them first.',
  carrier_exists: 'That account is already connected.',
  carrier_limit: `You can connect up to ${CARRIER_LIMIT} Cloudflare accounts.`,
  badge_exists: 'That API Token is already added to this account.',
  badge_limit: `An account can hold up to ${BADGE_LIMIT} API Tokens. Remove one to add another.`,
  badge_rejected: 'Cloudflare did not accept this API Token. Check that you copied all of it.',
  badge_wrong_account: 'This API Token cannot see the account you are adding it to.',
  account_required:
    'Cloudflare listed no accounts for this API Token. Check that it can read your account.',
  account_invalid: 'Choose accounts this API Token can reach.',
  badge_invalid: 'Check the label and the API Token, then try again.',
  secrets_unavailable: 'TurboPanel cannot store tokens on this instance yet.',
}

/** Codes where the panel's own sentence is worth showing after the dash. */
const KEEP_SERVER_TEXT = new Set(['badge_not_useful', 'provider_unavailable'])

/** The error code and the text after the dash in a failed-call message. */
function parseFailure(raw: string): { code?: string; text?: string } {
  const at = raw.search(/HTTP \d+: /)
  if (at < 0) return {}
  const rest = raw.slice(raw.indexOf(': ', at) + 2)
  const [code, ...after] = rest.split(' — ')
  return { code: code.trim().toLowerCase(), text: after.join(' — ').trim() || undefined }
}

/** Calm wording for a failed Cloudflare account call. */
export function tunnelErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : ''
  const { code, text } = parseFailure(raw)
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  if (code && KEEP_SERVER_TEXT.has(code) && text) return text
  if (code === 'provider_unavailable') {
    return 'Cloudflare could not be reached just now. Try again in a moment.'
  }
  return fallback
}
