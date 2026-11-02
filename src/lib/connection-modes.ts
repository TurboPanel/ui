import type {
  EdgeGate,
  IngressApplyCause,
  IngressCapabilities,
  IngressMode,
  IngressPhase,
  IngressStatus,
} from '@/lib/instance-api'

/** How visitors reach one of the control plane's own hostnames. */
export const CONNECTION_MODE_LABELS: Readonly<Record<IngressMode, string>> = {
  direct: 'Direct',
  'lan-only': 'LAN Only',
  'cloudflare-tunnel': 'Cloudflare Tunnel',
  'cloudflare-proxy': 'Cloudflare Proxy',
  'bunny-proxy': 'CDN Proxy',
  'private-overlay': 'Private Overlay',
  passthrough: 'Passthrough',
}

export const NOT_IMPLEMENTED_HINT = 'Not available yet'
export const GATE_CLOSED_HINT = 'Edge modes open after every server trusts this control plane'

/** The two public ports a Cloudflare tunnel can publish on. */
export const TUNNEL_PUBLIC_PORTS = [443, 8443] as const

export type ConnectionModeOption = {
  value: IngressMode
  label: string
  disabled: boolean
  detail: string | null
}

/**
 * The Connection Mode choices. A mode the control plane does not run yet is
 * disabled, and so is every edge mode while the edge gate is closed. The mode
 * a row already has always stays selectable.
 */
export function connectionModeOptions(
  modes: readonly IngressCapabilities[],
  gate: EdgeGate | null,
  current: IngressMode
): ConnectionModeOption[] {
  return modes.map((capability) => {
    const option = {
      value: capability.mode,
      label: CONNECTION_MODE_LABELS[capability.mode] ?? capability.mode,
    }
    if (capability.mode === current) return { ...option, disabled: false, detail: null }
    if (!capability.implemented) {
      return { ...option, disabled: true, detail: NOT_IMPLEMENTED_HINT }
    }
    if (capability.isEdge && gate?.open !== true) {
      const reason = gate?.reason ? `${GATE_CLOSED_HINT}. ${gate.reason}` : GATE_CLOSED_HINT
      return { ...option, disabled: true, detail: reason }
    }
    return { ...option, disabled: false, detail: null }
  })
}

/** LAN Only is fixed on 8443; every other mode shows the Public Port field. */
export function showsPublicPort(mode: IngressMode): boolean {
  return mode !== 'lan-only'
}

/** A tunnel publishes on 443 or 8443 only, so it gets a choice instead of a free field. */
export function usesTunnelPorts(mode: IngressMode): boolean {
  return mode === 'cloudflare-tunnel'
}

/**
 * The port to send with a change to `mode`: kept when the new mode accepts it,
 * else the mode's default (LAN Only is always its fixed 8443). `undefined` means leave it as stored.
 */
export function portForModeChange(
  capability: IngressCapabilities | undefined,
  port = 8443
): number | undefined {
  if (!capability) return undefined
  if (!showsPublicPort(capability.mode)) {
    return port === capability.defaultPublicPort ? undefined : capability.defaultPublicPort
  }
  if (!usesTunnelPorts(capability.mode)) return undefined
  return (TUNNEL_PUBLIC_PORTS as readonly number[]).includes(port)
    ? undefined
    : capability.defaultPublicPort
}

export function capabilityFor(
  modes: readonly IngressCapabilities[] | undefined,
  mode: IngressMode
): IngressCapabilities | undefined {
  return modes?.find((item) => item.mode === mode)
}

/** Edge rows are the ones a provider account connects; they carry Preflight / Connect / Disconnect. */
export function isProviderMode(
  modes: readonly IngressCapabilities[] | undefined,
  mode: IngressMode
): boolean {
  return capabilityFor(modes, mode)?.provider != null
}

export type PhaseTone = 'ok' | 'pending' | 'danger' | 'muted'

export const INGRESS_PHASE_PRESENTATION: Readonly<
  Record<IngressPhase, { label: string; tone: PhaseTone }>
> = {
  'not-applied': { label: 'Not Applied', tone: 'muted' },
  applying: { label: 'Applying', tone: 'pending' },
  healthy: { label: 'Healthy', tone: 'ok' },
  degraded: { label: 'Degraded', tone: 'pending' },
  failed: { label: 'Failed', tone: 'danger' },
  removed: { label: 'Removed', tone: 'muted' },
}

const STATUS_FAST_MS = 15_000
const STATUS_SLOW_MS = 60_000

/** A connection that is still settling is read every 15 seconds, else every minute. */
export function ingressStatusInterval(status: IngressStatus | undefined): number {
  return status?.phase === 'applying' || status?.phase === 'degraded'
    ? STATUS_FAST_MS
    : STATUS_SLOW_MS
}

/** Plain sentences for an apply the control plane refused. */
export const APPLY_CAUSE_TEXT: Readonly<Record<IngressApplyCause, string>> = {
  'not-available': 'This connection mode is not available yet.',
  'invalid-hostname': 'This hostname cannot be used with this connection mode.',
  'gate-closed': 'Edge modes are switched off. Confirm Edge Go-Live first.',
  'account-missing': 'Choose a Cloudflare account for this hostname first.',
  'token-invalid': 'Cloudflare refused the saved token. Recheck or replace the account.',
  'scope-missing': 'The Cloudflare token is missing a permission this hostname needs.',
  'zone-not-found': 'No zone on the Cloudflare account covers this hostname.',
  'dns-conflict': 'A DNS record for this hostname already exists.',
  'provider-error': 'Cloudflare answered with an error. Try again shortly.',
  'provider-rate-limited': 'Cloudflare is limiting requests. Try again in a few minutes.',
  'daemon-offline': 'The daemon on the control plane host is offline.',
  'edge-unreachable': 'The edge could not reach this control plane.',
}

const ACCOUNT_CHECK_LABELS: Readonly<Record<string, string>> = {
  'token-shape': 'Token Format',
  'token-verify': 'Token Valid',
  'scope-tunnels': 'Tunnel Scope',
  'scope-dns': 'DNS Scope',
  'token-expiry': 'Token Expiry',
  provider: 'Cloudflare Reachable',
}

/** A check id in book title case; an unknown id is shown as sent. */
export function checkLabel(id: string): string {
  return ACCOUNT_CHECK_LABELS[id] ?? id
}

const VISITOR_IP_TEXT: Readonly<Record<string, string>> = {
  'socket-peer': 'The connecting address',
  'cf-connecting-ip-loopback': 'CF-Connecting-IP from the local connector',
  'cf-connecting-ip-ranges': 'CF-Connecting-IP from Cloudflare ranges',
  'x-real-ip-edge-list': 'X-Real-IP from the edge list',
  'overlay-peer': 'The overlay peer address',
  'proxy-protocol': 'The PROXY protocol header',
}

/** What the visitor IP comes from, per mode, in words. */
export function visitorIpSourceText(capability: IngressCapabilities): string {
  return VISITOR_IP_TEXT[capability.visitorIpSource] ?? capability.visitorIpSource
}
