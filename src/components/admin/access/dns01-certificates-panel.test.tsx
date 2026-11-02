// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PanelDnsCertificate } from '@/lib/instance-api'
import { CoverageChips, Dns01State } from './dns01-certificates-panel'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/ingress', () => ({
  useOrderPanelDnsCertificate: () => ({ run: vi.fn(), isPending: false, variables: undefined }),
  usePanelDnsCertificate: () => ({ data: undefined }),
}))

const NOW = Date.parse('2026-11-01T12:00:00Z')

function state(over: Partial<PanelDnsCertificate> = {}): PanelDnsCertificate {
  return {
    ok: true,
    stage: 'idle',
    attempts: 0,
    nextAttemptAt: null,
    stopUntil: null,
    lastError: null,
    renewAt: null,
    notAfter: null,
    expiryAlerted: [],
    ...over,
  }
}

afterEach(cleanup)

describe('Dns01State', () => {
  it('highlights the Waiting for DNS step', () => {
    const { container } = render(
      <Dns01State id="h1" state={state({ stage: 'waiting-dns' })} now={NOW} />
    )
    const current = container.querySelectorAll('[aria-selected="true"]')
    expect(current).toHaveLength(1)
    expect(current[0].textContent).toBe('Waiting for DNS')
    expect(screen.getByLabelText('Waiting for DNS, current step')).toBeTruthy()
  })

  it('disables Retry and says until when while paused', () => {
    render(
      <Dns01State
        id="h1"
        state={state({
          stage: 'backoff',
          stopUntil: '2026-11-01T13:00:00Z',
          lastError: { cause: 'txt-not-visible', detail: 'The TXT record never appeared.', at: '' },
        })}
        now={NOW}
      />
    )
    expect((screen.getByText('Retry') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/Retry is paused until/)).toBeTruthy()
    expect(screen.getByText('Back-off')).toBeTruthy()
    expect(screen.getByText('TXT Record Not Visible: The TXT record never appeared.')).toBeTruthy()
  })

  it('enables Retry once the pause has passed', () => {
    render(
      <Dns01State
        id="h1"
        state={state({ stage: 'failed', stopUntil: '2026-11-01T11:00:00Z' })}
        now={NOW}
      />
    )
    expect((screen.getByText('Retry') as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/Retry is paused/)).toBeNull()
  })
})

describe('CoverageChips', () => {
  it('marks each hostname Covered or Not Covered', () => {
    render(
      <CoverageChips dnsNames={['*.example.com']} hostnames={['cp.example.com', 'example.com']} />
    )
    expect(screen.getByText('cp.example.com: Covered')).toBeTruthy()
    expect(screen.getByText('example.com: Not Covered')).toBeTruthy()
  })
})
