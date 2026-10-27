// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AddServerTierSection } from './add-server-tier-section'

const { useBillingCatalog } = vi.hoisted(() => ({ useBillingCatalog: vi.fn() }))

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  TextInput: (props: { accessibilityLabel?: string }) => (
    <input aria-label={props.accessibilityLabel} readOnly />
  ),
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/open-hosted-page', () => ({ openHostedPage: vi.fn() }))
vi.mock('@/components/org/billing-license-dialog', () => ({ LicenseDialog: () => null }))
vi.mock('@/lib/queries/billing', () => ({
  useBillingCatalog,
  useBillingSubscription: () => ({ data: undefined, isSuccess: false }),
  useCreateBillingCheckout: () => ({ isPending: false, run: vi.fn() }),
  useRestoreBillingLicenses: () => ({ isPending: false, run: vi.fn() }),
}))

afterEach(cleanup)

function renderSection() {
  render(
    <AddServerTierSection
      orgId="org-1"
      chosenTierId={null}
      onChooseTier={vi.fn()}
      refusal={null}
      onLicenseReady={vi.fn()}
    />
  )
}

describe('AddServerTierSection', () => {
  it('offers a retry instead of a dead end when the tier list fails to load', () => {
    const refetch = vi.fn()
    useBillingCatalog.mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      error: new Error('/api/client/v1/billing/catalog failed: HTTP 502'),
      refetch,
    })
    renderSection()
    expect(screen.queryByLabelText('Tier this server needs')).toBeNull()
    // Always the plain sentence, never the raw HTTP text.
    expect(screen.getByText('Could not load the license tiers.')).toBeTruthy()
    expect(screen.queryByText(/HTTP 502/)).toBeNull()
    fireEvent.click(screen.getByLabelText('Load the license tiers again'))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the working picker when a refresh fails after the tiers loaded', () => {
    useBillingCatalog.mockReturnValue({
      data: { tiers: [], sizeCommand: null },
      isError: true,
      isFetching: false,
      error: new Error('/api/client/v1/billing/catalog failed: HTTP 502'),
      refetch: vi.fn(),
    })
    renderSection()
    expect(screen.queryByLabelText('Load the license tiers again')).toBeNull()
    expect(
      screen.getByText('Could not refresh the license tiers; showing the last list.')
    ).toBeTruthy()
  })
})
