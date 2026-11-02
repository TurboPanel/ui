// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  EdgeGate,
  IngressCapabilities,
  IngressMode,
  InstanceHostnameRecord,
} from '@/lib/instance-api'
import { GATE_CLOSED_HINT, NOT_IMPLEMENTED_HINT } from '@/lib/connection-modes'
import {
  applyFeedback,
  ConnectionModeCell,
  modeChangePatch,
  MODES_UNAVAILABLE,
  SAVE_FIRST_HINT,
} from './connection-mode-cell'
import { ModePublicPortCell } from './hostname-ingress-cells'

const update = vi.hoisted(() => ({ run: vi.fn(), isPending: false }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/queries/ingress', () => {
  const idle = () => ({ run: vi.fn(), isPending: false })
  return {
    useUpdateHostnameIngress: () => update,
    usePreflightHostnameIngress: idle,
    useApplyHostnameIngress: idle,
    useRemoveHostnameIngress: idle,
    useHostnameIngressStatus: () => ({ data: undefined }),
  }
})

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
  capability('cloudflare-tunnel', { isEdge: true, provider: 'cloudflare', defaultPublicPort: 443 }),
  capability('cloudflare-proxy', { isEdge: true, provider: 'cloudflare', implemented: false }),
]

const CLOSED: EdgeGate = {
  open: false,
  reason: 'One server is not pinned.',
  confirmedAt: null,
  confirmedBy: null,
  forcedClosed: false,
}

const RECORD = {
  id: 'h1',
  host: 'cp.example.com',
  source: 'platform-ca',
  uploadedCertId: null,
  status: 'ready',
  notAfter: null,
  acmeLastAttemptAt: null,
  acmeLastError: null,
  mode: 'direct',
  publicPort: 8443,
  ingressId: null,
} satisfies InstanceHostnameRecord

function option(name: string): HTMLOptionElement {
  return screen.getByRole('option', { name }) as HTMLOptionElement
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ConnectionModeCell', () => {
  it('disables edge modes while the gate is closed and says why', () => {
    render(
      <ConnectionModeCell
        record={RECORD}
        modes={MODES}
        gate={CLOSED}
        accounts={[]}
        lockedReason={null}
        busy={false}
      />
    )
    expect(option('Direct').disabled).toBe(false)
    expect(option('LAN Only').disabled).toBe(false)
    expect(option('Cloudflare Tunnel').disabled).toBe(true)
    expect(screen.getByText(`${GATE_CLOSED_HINT}. One server is not pinned.`)).toBeTruthy()
  })

  it('disables a mode the control plane does not run yet, even with the gate open', () => {
    render(
      <ConnectionModeCell
        record={RECORD}
        modes={MODES}
        gate={{ ...CLOSED, open: true }}
        accounts={[]}
        lockedReason={null}
        busy={false}
      />
    )
    expect(option('Cloudflare Tunnel').disabled).toBe(false)
    expect(option('Cloudflare Proxy').disabled).toBe(true)
    expect(screen.getByText(NOT_IMPLEMENTED_HINT)).toBeTruthy()
  })

  it('says modes need a newer control plane when none are offered', () => {
    render(
      <ConnectionModeCell
        record={RECORD}
        modes={[]}
        gate={null}
        accounts={[]}
        lockedReason={null}
        busy={false}
      />
    )
    expect(screen.getByText(MODES_UNAVAILABLE)).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('locks an unsaved row and says to save first', () => {
    render(
      <ConnectionModeCell
        record={null}
        modes={MODES}
        gate={CLOSED}
        accounts={[]}
        lockedReason={SAVE_FIRST_HINT}
        busy={false}
      />
    )
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByText(SAVE_FIRST_HINT)).toBeTruthy()
  })

  it('sends a mode change as a patch and shows a refusal beside the row', async () => {
    update.run.mockResolvedValue({
      ok: true,
      value: { ok: false, error: 'Disconnect this hostname before changing its mode or account.' },
    })
    render(
      <ConnectionModeCell
        record={RECORD}
        modes={MODES}
        gate={{ ...CLOSED, open: true }}
        accounts={[]}
        lockedReason={null}
        busy={false}
      />
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'lan-only' } })
    expect(update.run).toHaveBeenCalledWith({
      id: 'h1',
      patch: { mode: 'lan-only', ingressId: null },
    })
    expect(
      await screen.findByText('Disconnect this hostname before changing its mode or account.')
    ).toBeTruthy()
  })

  it('shows the account link and connection actions for an edge row', () => {
    render(
      <ConnectionModeCell
        record={{ ...RECORD, mode: 'cloudflare-tunnel' }}
        modes={MODES}
        gate={CLOSED}
        accounts={[]}
        lockedReason={null}
        busy={false}
      />
    )
    expect(screen.getByText('Connect a Cloudflare account')).toBeTruthy()
    expect((screen.getByText('Preflight') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByText('Connect') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('modeChangePatch', () => {
  const account = {
    id: 'a1',
    provider: 'cloudflare' as const,
    label: 'Main',
    accountId: 'acc',
    zoneIds: [],
    scopes: null,
    lastVerifiedAt: null,
    lastError: null,
    createdAt: '2026-11-01T00:00:00Z',
  }

  it('picks the only matching account and a port the tunnel accepts', () => {
    expect(modeChangePatch('cloudflare-tunnel', { publicPort: 9000 }, MODES, [account])).toEqual({
      mode: 'cloudflare-tunnel',
      ingressId: 'a1',
      publicPort: 443,
    })
    expect(modeChangePatch('direct', { publicPort: 9000 }, MODES, [account])).toEqual({
      mode: 'direct',
      ingressId: null,
    })
    expect(modeChangePatch('lan-only', { publicPort: 443 }, MODES, [account])).toEqual({
      mode: 'lan-only',
      ingressId: null,
      publicPort: 8443,
    })
  })
})

describe('applyFeedback', () => {
  it('treats a request that died in flight as no failure', () => {
    expect(
      applyFeedback({ ok: false, error: 'HTTP 502', cause: new Error('x failed: HTTP 502') })
    ).toBeNull()
  })

  it('offers Replace Existing Record for a DNS conflict', () => {
    expect(
      applyFeedback({
        ok: true,
        value: { ok: false, cause: 'dns-conflict', detail: 'CNAME exists.' },
      })
    ).toEqual({
      text: 'A DNS record for this hostname already exists. CNAME exists.',
      conflict: true,
    })
    expect(applyFeedback({ ok: true, value: { ok: true } })).toBeNull()
    const refused = new Error('apply failed: HTTP 500: boom')
    expect(applyFeedback({ ok: false, error: refused.message, cause: refused })).toEqual({
      text: refused.message,
      conflict: false,
    })
  })
})

describe('ModePublicPortCell', () => {
  const row = { host: 'cp.example.com', source: 'platform-ca' as const, uploadedCertId: null }
  const noop = () => undefined

  it('hides the Public Port field for LAN Only', () => {
    render(
      <ModePublicPortCell
        mode="lan-only"
        row={row}
        busy={false}
        onChange={noop}
        onValidityChange={noop}
      />
    )
    expect(screen.queryByLabelText('Public Port')).toBeNull()
    expect(screen.getByText('8443, fixed for LAN Only')).toBeTruthy()
  })

  it('keeps the free field for Direct and offers 443 or 8443 for a tunnel', () => {
    render(
      <ModePublicPortCell
        mode="direct"
        row={row}
        busy={false}
        onChange={noop}
        onValidityChange={noop}
      />
    )
    expect(screen.getByLabelText('Public Port')).toBeTruthy()
    cleanup()
    render(
      <ModePublicPortCell
        mode="cloudflare-tunnel"
        row={row}
        busy={false}
        onChange={noop}
        onValidityChange={noop}
      />
    )
    expect(screen.getAllByRole('option').map((item) => item.textContent)).toEqual(['443', '8443'])
  })
})
