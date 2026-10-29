/**
 * Cloudflare accounts and their API tokens (the carrier and badge routes).
 * Pure rules and copy; the transport lives in `instance-api.ts`.
 */
import type { TunnelBadge, TunnelBadgeDependent } from '@/lib/instance-api'
import type { BadgeTone } from '@/components/ui/badge'

export const CARRIER_LIMIT = 10
export const BADGE_LIMIT = 50
export const TUNNEL_LIMIT = 50

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
  tunnel_invalid: 'Check the name and where the tunnel should run, then try again.',
  tunnel_exists: 'A tunnel with this name already exists. Choose another name.',
  tunnel_limit: `An organization can have up to ${TUNNEL_LIMIT} tunnels. Remove one to add another.`,
  tunnel_in_use: 'This tunnel still carries hostnames. Remove them first.',
  tunnel_removing: 'This tunnel is being removed. Use another tunnel, or wait until it is gone.',
  badge_in_use:
    'Other API Tokens do not cover everything this one does. Add one that does first, or remove what depends on it.',
  zone_invalid: 'Check the zone id and name, then try again.',
  zone_not_reachable:
    'This API Token cannot read DNS for that zone. It needs Zone · DNS · Edit on the zone, and the zone id has to be right.',
  zone_wrong_account:
    'That zone belongs to another Cloudflare account. A tunnel can only use zones of its own account.',
  zone_name_needed:
    'Cloudflare did not tell us the name of that zone. Type the zone name as well, for example example.com.',
  zone_limit: 'An API Token can name up to 50 zones.',
  tunnel_not_ready: 'This tunnel is not ready at Cloudflare yet. Wait a moment, then try again.',
  badge_cannot_tunnel:
    'No API Token on this Cloudflare account can manage tunnels. Add or fix one under Cloudflare Accounts.',
  badge_cannot_dns:
    'The hostname was not added. Its zone is in this Cloudflare account, but no API Token on it can edit DNS there. Add an API Token that can edit DNS for that zone, then try again.',
  carrier_missing:
    'The Cloudflare account for this tunnel was removed. Connect it again under Cloudflare Accounts.',
  datacenter_required: 'Choose the datacenter whose servers should run this tunnel.',
  datacenter_invalid: 'Choose a datacenter of this organization.',
  server_invalid: 'Choose servers of this organization.',
  server_not_in_datacenter: 'Every server has to be in the datacenter you chose.',
  server_never_carries:
    'One of these servers is set to never run tunnels. Turn that off for it, or leave it out.',
  hostname_invalid: 'That does not look like a hostname, for example app.example.com.',
  hostname_in_use: 'This hostname is already on a tunnel.',
  hosting_mismatch: 'This hostname belongs to a site of another organization.',
  doorway_limit: 'This is the most hostnames a tunnel can carry. Remove one to add another.',
  zone_not_found:
    'Cloudflare could not find the zone for this hostname under this account. Check the hostname.',
  carry_invalid: 'Choose whether this server runs tunnels.',
  tunnel_daemon_too_old: 'Update this server before deploying a site with a tunnel-only name.',
  tunnel_name_public_certificate: 'A tunnel-only name cannot use a public certificate.',
}

/** Codes where the panel's own sentence is worth showing after the dash. */
const KEEP_SERVER_TEXT = new Set([
  'badge_not_useful',
  'provider_unavailable',
  // These say which zone or permission is missing, so the panel's own sentence is the useful one.
  'badge_cannot_dns',
  'badge_cannot_tunnel',
])

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
  if (code && KEEP_SERVER_TEXT.has(code) && text) return text
  if (code && ERROR_COPY[code]) return ERROR_COPY[code]
  if (code === 'provider_unavailable') {
    return 'Cloudflare could not be reached just now. Try again in a moment.'
  }
  return fallback
}

/**
 * A deploy refused because of a tunnel-only hostname, in plain words with the
 * next step and the names it is about. `null` for any other code.
 */
export function tunnelDeployRefusalMessage(
  code: string,
  hostnames: readonly string[] = []
): string | null {
  const names = hostnames.length > 0 ? ` (${hostnames.join(', ')})` : ''
  if (code === 'tunnel_name_public_certificate') {
    return `A tunnel-only name cannot use a public certificate${names}. Choose Self-signed for this site's certificate, then deploy again.`
  }
  if (code === 'tunnel_daemon_too_old') {
    return `Update this server before deploying a site with a tunnel-only name${names}. It installs on its own at the next update check.`
  }
  return null
}

/** "Still needed for: the tunnel web; the hostname blog.example.com (example.com) and 3 more." */
export function dependentsSummary(
  dependents: readonly TunnelBadgeDependent[],
  total: number
): string {
  const listed = dependents.slice(0, 5).map((d) => {
    if (d.kind === 'tunnel') return `the tunnel ${d.name}`
    return d.zone ? `the hostname ${d.name} (${d.zone})` : `the hostname ${d.name}`
  })
  const more = Math.max(total, dependents.length) - listed.length
  const tail = more > 0 ? ` and ${more} more` : ''
  return `Still needed for ${listed.join('; ')}${tail}. Add another API Token that covers it first.`
}

const ZONE_ID = /^[A-Za-z0-9_-]{1,64}$/
const ZONE_NAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** A zone the person types, checked before sending; null means it is fine. */
export function zoneProblem(rawId: string, rawName: string): string | null {
  const id = rawId.trim()
  const name = rawName.trim().toLowerCase()
  if (id.length === 0) return 'Paste the Zone ID from the zone page in Cloudflare.'
  if (!ZONE_ID.test(id)) return 'A Zone ID is letters and numbers only, without spaces.'
  if (name.length > 0 && !ZONE_NAME.test(name)) return 'A zone name looks like example.com.'
  return null
}

/** The zone body to send: the name is left out when it was not typed. */
export function zoneBody(rawId: string, rawName: string): { id: string; name?: string } {
  const name = rawName.trim().toLowerCase()
  return name.length > 0 ? { id: rawId.trim(), name } : { id: rawId.trim() }
}
