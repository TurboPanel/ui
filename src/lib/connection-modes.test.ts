import { describe, expect, it } from 'vitest'
import {
  APPLY_CAUSE_TEXT,
  capabilityFor,
  checkLabel,
  connectionModeOptions,
  GATE_CLOSED_HINT,
  INGRESS_PHASE_PRESENTATION,
  ingressStatusInterval,
  isProviderMode,
  NOT_IMPLEMENTED_HINT,
  portForModeChange,
  showsPublicPort,
  usesTunnelPorts,
  visitorIpSourceText,
} from './connection-modes'
import type { EdgeGate, IngressCapabilities, IngressMode } from './instance-api'

function capability(
  mode: IngressMode,
  over: Partial<IngressCapabilities> = {}
): IngressCapabilities {
  return {
    mode,
    implemented: true,
    originMustBePublic: false,
    visitorCertificateIssuer: 'platform-ca',
    originCertificate: 'platform-ca',
    visitorIpSource: 'socket-peer',
    defaultPublicPort: 8443,
    heartbeatSeconds: null,
    idleLimitSeconds: null,
    apiDriven: false,
    provider: null,
    allowedCertificateSources: [],
    isEdge: false,
    ...over,
  }
}

const MODES = [
  capability('direct'),
  capability('lan-only'),
  capability('cloudflare-tunnel', {
    isEdge: true,
    provider: 'cloudflare',
    defaultPublicPort: 443,
    visitorIpSource: 'cf-connecting-ip-loopback',
  }),
  capability('cloudflare-proxy', { isEdge: true, provider: 'cloudflare', implemented: false }),
]

const CLOSED: EdgeGate = {
  open: false,
  reason: 'Two servers are not pinned.',
  confirmedAt: null,
  confirmedBy: null,
  forcedClosed: false,
}

describe('connectionModeOptions', () => {
  it('disables edge modes while the gate is closed, with the reason', () => {
    const tunnel = connectionModeOptions(MODES, CLOSED, 'direct').find(
      (option) => option.value === 'cloudflare-tunnel'
    )
    expect(tunnel).toMatchObject({ disabled: true })
    expect(tunnel?.detail).toBe(`${GATE_CLOSED_HINT}. Two servers are not pinned.`)
  })

  it('says only the hint when a closed gate gives no reason', () => {
    const options = connectionModeOptions(MODES, { ...CLOSED, reason: undefined }, 'direct')
    expect(options[2].detail).toBe(GATE_CLOSED_HINT)
    expect(connectionModeOptions(MODES, null, 'direct')[2].disabled).toBe(true)
  })

  it('opens edge modes once the gate is open but keeps unimplemented ones disabled', () => {
    const options = connectionModeOptions(MODES, { ...CLOSED, open: true }, 'direct')
    expect(options.map((option) => [option.label, option.disabled, option.detail])).toEqual([
      ['Direct', false, null],
      ['LAN Only', false, null],
      ['Cloudflare Tunnel', false, null],
      ['Cloudflare Proxy', true, NOT_IMPLEMENTED_HINT],
    ])
  })

  it('keeps the current mode selectable', () => {
    const options = connectionModeOptions(MODES, CLOSED, 'cloudflare-tunnel')
    expect(options[2]).toMatchObject({ disabled: false, detail: null })
  })
})

describe('ports per mode', () => {
  it('hides the field only for LAN Only and limits a tunnel to 443 or 8443', () => {
    expect(showsPublicPort('lan-only')).toBe(false)
    expect(showsPublicPort('direct')).toBe(true)
    expect(usesTunnelPorts('cloudflare-tunnel')).toBe(true)
    expect(usesTunnelPorts('direct')).toBe(false)
  })

  it('sends the default port only when the new mode refuses the current one', () => {
    const tunnel = capabilityFor(MODES, 'cloudflare-tunnel')
    expect(portForModeChange(tunnel, 9000)).toBe(443)
    expect(portForModeChange(tunnel, 8443)).toBeUndefined()
    expect(portForModeChange(tunnel, undefined)).toBeUndefined()
    expect(portForModeChange(capabilityFor(MODES, 'direct'), 9000)).toBeUndefined()
    expect(portForModeChange(undefined, 9000)).toBeUndefined()
  })
})

describe('labels and intervals', () => {
  it('knows which modes use a provider account', () => {
    expect(isProviderMode(MODES, 'cloudflare-tunnel')).toBe(true)
    expect(isProviderMode(MODES, 'direct')).toBe(false)
    expect(isProviderMode(undefined, 'direct')).toBe(false)
  })

  it('reads status faster while a connection settles', () => {
    expect(ingressStatusInterval({ phase: 'applying' })).toBe(15_000)
    expect(ingressStatusInterval({ phase: 'degraded' })).toBe(15_000)
    expect(ingressStatusInterval({ phase: 'healthy' })).toBe(60_000)
    expect(ingressStatusInterval(undefined)).toBe(60_000)
  })

  it('labels every phase and apply cause', () => {
    expect(INGRESS_PHASE_PRESENTATION.healthy).toEqual({ label: 'Healthy', tone: 'ok' })
    for (const text of Object.values(APPLY_CAUSE_TEXT)) expect(text).toMatch(/\.$/)
  })

  it('names checks in title case and passes unknown ids through', () => {
    expect(checkLabel('scope-tunnels')).toBe('Tunnel Scope')
    expect(checkLabel('scope-dns')).toBe('DNS Scope')
    expect(checkLabel('something-new')).toBe('something-new')
  })

  it('says where the visitor address comes from', () => {
    expect(visitorIpSourceText(MODES[2])).toBe('CF-Connecting-IP from the local connector')
    expect(
      visitorIpSourceText(capability('bunny-proxy', { visitorIpSource: 'x-real-ip-edge-list' }))
    ).toBe('X-Real-IP from the edge list')
    expect(visitorIpSourceText(capability('passthrough', { visitorIpSource: 'other' }))).toBe(
      'other'
    )
  })
})
