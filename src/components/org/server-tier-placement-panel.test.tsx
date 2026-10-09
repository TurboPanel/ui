// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerDetailRecord } from '@/lib/instance-api'
import { ServerTierPlacementPanel } from './server-tier-placement-panel'

const { useAuth, useBillingCatalog, useSetServerLicenseTier, useCan } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useBillingCatalog: vi.fn(),
  useSetServerLicenseTier: vi.fn(),
  useCan: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

vi.mock('@/lib/auth-context', () => ({ useAuth }))
vi.mock('@/lib/queries/billing', () => ({ useBillingCatalog }))
vi.mock('@/lib/queries/servers', () => ({ useSetServerLicenseTier }))
vi.mock('@/lib/query-client', () => ({ useCan }))

vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: {
    detailLine: {},
    detailLabel: {},
    muted: {},
  },
}))

vi.mock('@/components/ui', () => ({
  Badge: ({ label }: { label: string }) => <span>{label}</span>,
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string
    onPress?: () => void
    disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  InlineNotice: ({ title }: { title: string }) => <div role="alert">{title}</div>,
  ModalSheet: ({
    visible,
    title,
    children,
  }: {
    visible: boolean
    title: string
    children?: unknown
  }) => (visible ? <div data-testid="modal">{title}{children as never}</div> : null),
  MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
  SectionPanel: ({ title, children }: { title: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function server(placement: NonNullable<ServerDetailRecord['tierPlacement']>): ServerDetailRecord {
  return {
    id: 'srv-1',
    name: 'web-1',
    organizationId: 'org-1',
    licenseId: 'lic-1',
    tierPlacement: placement,
    machineClass: null,
    layoutPaths: null,
    options: null,
    createdAt: '2026-01-01T00:00:00Z',
    connected: true,
    hostname: 'web-1',
    remoteAddress: null,
    address: null,
    addressSource: null,
    addressScope: null,
    addressInterface: null,
    lastInboundAt: null,
    connectedAt: null,
    statusChangedAt: null,
    geo: null,
    os: null,
    osDisplay: null,
    osLogo: null,
    datacenters: [],
    labels: [],
    sshPort: 22,
    sshPortSource: 'platform',
    ntpDefaults: null,
    ntpDefaultsSource: null,
    timezone: null,
    timezoneSource: null,
    canForget: false,
    colocated: false,
    platformServer: false,
    updateAvailable: false,
    services: null,
  } as unknown as ServerDetailRecord
}

describe('ServerTierPlacementPanel', () => {
  it('shows shortfall guidance and the picker from tiersFree before the catalogue loads', () => {
    useAuth.mockReturnValue({ billingEnabled: true })
    useCan.mockReturnValue(true)
    useBillingCatalog.mockReturnValue({ data: undefined })
    useSetServerLicenseTier.mockReturnValue({ run: vi.fn(), isPending: false })

    const detail = server({
      licenseTier: 'S1',
      requiredTier: 'S6',
      recommendedTier: 'S6',
      unwatched: { nics: ['eth1'], drives: [], gpus: [] },
      pickedTier: null,
      tierPickNotice: null,
      tiersFree: [
        { tierId: 'id-s1', label: 'S1', free: 0 },
        { tierId: 'id-s6', label: 'S6', free: 1 },
      ],
    })

    render(<ServerTierPlacementPanel orgId="org-1" server={detail} />)

    expect(screen.getByRole('alert').textContent).toContain('exceeds what S1 covers')
    expect(screen.getByText('Put this server on')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Buy one' })).toBeNull()
  })

  it('opens a confirm sheet before applying a tier pick', () => {
    useAuth.mockReturnValue({ billingEnabled: true })
    useCan.mockReturnValue(true)
    useBillingCatalog.mockReturnValue({ data: { tiers: [] } })
    const run = vi.fn().mockResolvedValue({ ok: true })
    useSetServerLicenseTier.mockReturnValue({ run, isPending: false })

    const detail = server({
      licenseTier: 'S1',
      requiredTier: 'S6',
      recommendedTier: 'S6',
      unwatched: { nics: [], drives: [], gpus: [] },
      pickedTier: null,
      tierPickNotice: null,
      tiersFree: [
        { tierId: 'id-s1', label: 'S1', free: 0 },
        { tierId: 'id-s6', label: 'S6', free: 1 },
      ],
    })

    render(<ServerTierPlacementPanel orgId="org-1" server={detail} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    expect(screen.getByTestId('modal').textContent).toContain('Confirm license tier')
    expect(run).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(run).toHaveBeenCalledWith('id-s6')
  })

  it('shows mapped refusal copy when apply returns a mutation error string', async () => {
    useAuth.mockReturnValue({ billingEnabled: true })
    useCan.mockReturnValue(true)
    useBillingCatalog.mockReturnValue({ data: { tiers: [] } })
    const run = vi.fn().mockResolvedValue({
      ok: false,
      error: 'HTTP 422: tier_below_required',
      cause: new Error('HTTP 422: tier_below_required'),
    })
    useSetServerLicenseTier.mockReturnValue({ run, isPending: false })

    const detail = server({
      licenseTier: 'S1',
      requiredTier: 'S6',
      recommendedTier: 'S6',
      unwatched: { nics: [], drives: [], gpus: [] },
      pickedTier: null,
      tierPickNotice: null,
      tiersFree: [
        { tierId: 'id-s1', label: 'S1', free: 0 },
        { tierId: 'id-s6', label: 'S6', free: 1 },
      ],
    })

    render(<ServerTierPlacementPanel orgId="org-1" server={detail} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByText(/below what this server needs/)).toBeTruthy()
  })

  it('opens a confirm sheet before clearing an owner pick', () => {
    useAuth.mockReturnValue({ billingEnabled: true })
    useCan.mockReturnValue(true)
    useBillingCatalog.mockReturnValue({ data: { tiers: [] } })
    const run = vi.fn().mockResolvedValue({ ok: true })
    useSetServerLicenseTier.mockReturnValue({ run, isPending: false })

    const detail = server({
      licenseTier: 'S3',
      requiredTier: 'S3',
      recommendedTier: 'S3',
      unwatched: { nics: [], drives: [], gpus: [] },
      pickedTier: 'S3',
      tierPickNotice: null,
      tiersFree: [{ tierId: 'id-s3', label: 'S3', free: 1 }],
    })

    render(<ServerTierPlacementPanel orgId="org-1" server={detail} />)

    fireEvent.click(screen.getByRole('button', { name: 'Use the smallest that fits' }))
    expect(screen.getByTestId('modal').textContent).toContain('Clear license tier pick')

    fireEvent.click(screen.getByRole('button', { name: 'Clear pick' }))
    expect(run).toHaveBeenCalledWith(null)
  })

  it('hides pick controls for non-owners', () => {
    useAuth.mockReturnValue({ billingEnabled: true })
    useCan.mockReturnValue(false)
    useBillingCatalog.mockReturnValue({ data: undefined })
    useSetServerLicenseTier.mockReturnValue({ run: vi.fn(), isPending: false })

    const detail = server({
      licenseTier: 'S2',
      requiredTier: 'S2',
      recommendedTier: 'S2',
      unwatched: { nics: [], drives: [], gpus: [] },
      pickedTier: null,
      tierPickNotice: null,
      tiersFree: [{ tierId: 'id-s2', label: 'S2', free: 2 }],
    })

    render(<ServerTierPlacementPanel orgId="org-1" server={detail} />)

    expect(screen.queryByText('Put this server on')).toBeNull()
    expect(screen.getByText(/Only organization owners/)).toBeTruthy()
  })
})
