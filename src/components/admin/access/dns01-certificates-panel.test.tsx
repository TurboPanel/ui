// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PanelDnsCertificate } from '@/lib/instance-api'
import { formatLocalDateTime } from '@/lib/format-datetime'
import { CoverageChips, Dns01RowNote, Dns01State } from './dns01-certificates-panel'

const mocks = vi.hoisted(() => ({ run: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', async () => (await import('./access-ui-stub')).accessUiStub)
vi.mock(
  '@/components/ui/panel-styles',
  async () => (await import('./access-ui-stub')).panelStylesStub
)
vi.mock('@/lib/queries/ingress', () => ({
  useOrderPanelDnsCertificate: () => ({ run: mocks.run, isPending: false, variables: undefined }),
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

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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

const LOOKUP_ERROR = {
  cause: 'dns-lookup' as const,
  detail: 'No nameservers found for example.com.',
  at: '2026-11-01T11:30:00Z',
}

describe('Dns01RowNote', () => {
  it('shows the cause, the detail, when it happened and a Retry that calls the retry route', async () => {
    mocks.run.mockResolvedValue({ ok: true, value: state({ stage: 'waiting-dns' }) })
    render(
      <Dns01RowNote id="h1" state={state({ stage: 'failed', lastError: LOOKUP_ERROR })} now={NOW} />
    )
    expect(screen.getByText('Failed')).toBeTruthy()
    expect(
      screen.getByText('Nameserver Lookup Failed: No nameservers found for example.com.')
    ).toBeTruthy()
    expect(
      screen.getByText(`Last Failure: ${formatLocalDateTime('2026-11-01T11:30:00Z')}`)
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith({ id: 'h1', retry: true }))
  })

  it('shows a refused retry beside the button', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      value: { ok: false, error: 'An order for this name is already open.' },
    })
    render(
      <Dns01RowNote
        id="h1"
        state={state({
          stage: 'backoff',
          nextAttemptAt: '2026-11-01T12:05:00Z',
          lastError: LOOKUP_ERROR,
        })}
        now={NOW}
      />
    )
    expect(screen.getByText('Back-off')).toBeTruthy()
    expect(
      screen.getByText(`Next Attempt: ${formatLocalDateTime('2026-11-01T12:05:00Z')}`)
    ).toBeTruthy()
    fireEvent.click(screen.getByText('Retry'))
    expect(await screen.findByText('An order for this name is already open.')).toBeTruthy()
  })

  it('shows the step while an order runs, without Retry', () => {
    render(<Dns01RowNote id="h1" state={state({ stage: 'waiting-dns' })} now={NOW} />)
    expect(screen.getByText('DNS-01: Waiting for DNS…')).toBeTruthy()
    expect(screen.queryByText('Retry')).toBeNull()
  })

  it('shows nothing once issued or before the first order', () => {
    const { container } = render(
      <>
        <Dns01RowNote id="h1" state={state({ stage: 'issued' })} now={NOW} />
        <Dns01RowNote id="h2" state={state()} now={NOW} />
      </>
    )
    expect(container.textContent).toBe('')
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
