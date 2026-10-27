// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import { UpdateAvailableBanner } from './update-available-banner'

const { push, writeDismissed } = vi.hoisted(() => ({ push: vi.fn(), writeDismissed: vi.fn() }))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', async () => ({
  Button: (await import('@/components/ui/button')).Button,
  InlineNotice: (await import('@/components/ui/inline-notice')).InlineNotice,
  TextLink: (await import('@/components/ui/text-link')).TextLink,
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/admin/updates/console-build', () => ({ readConsoleBuild: () => null }))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: {} }),
  isAdminSession: () => true,
}))
vi.mock('@/lib/queries/auth', () => ({
  useInstallStatusQuery: () => ({ data: { runtime: 'deno' } }),
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceUpdates: () => ({ data: {} }),
  useUpgradeActiveRun: () => ({ data: null }),
}))
vi.mock('@/lib/update-status', () => ({
  readDismissedUpdateBanner: () => null,
  writeDismissedUpdateBanner: writeDismissed,
  updateOffered: () => true,
  showsUpdateBanner: () => true,
  updateBanner: () => ({
    key: 'cp:v0.1.20',
    title: 'TurboPanel update available: control plane v0.1.20',
    body: 'This updates the control plane. It installs on its own at the next check; open Admin > Updates to follow it or pause updates.',
  }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  push.mockClear()
  writeDismissed.mockClear()
})

function coarsePointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
}

describe('update banner on a phone-width window', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[1])
    env.width = 390
  })

  it('is one line: "Update available · Details", with no detail', () => {
    render(<UpdateAvailableBanner />)
    expect(screen.getByText('Update available ·')).toBeTruthy()
    expect(screen.getByText('Details')).toBeTruthy()
    expect(screen.queryByText(/installs on its own/)).toBeNull()
    expect(screen.getByText('Update available ·').getAttribute('data-lines')).toBe('1')
  })

  it('opens Admin > Updates from a 44 pt link', () => {
    render(<UpdateAvailableBanner />)
    const details = screen.getByRole('link', {
      name: /^Open Admin > Updates\. TurboPanel update available/,
    })
    expect(styleOf(details).minHeight).toBe(44)
    fireEvent.click(details)
    expect(push).toHaveBeenCalledWith('/admin/updates')
  })

  it('keeps a 44 pt Dismiss', () => {
    render(<UpdateAvailableBanner />)
    const dismiss = screen.getByRole('button', { name: 'Dismiss the update notice' })
    expect(styleOf(dismiss).minHeight).toBe(44)
    fireEvent.click(dismiss)
    expect(writeDismissed.mock.calls[0]?.[1]).toBe('cp:v0.1.20')
  })
})

describe('update banner on a wide window', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
    env.width = 1200
  })

  it('shows one line of title and at most two of detail, so the detail is not cut short', () => {
    render(<UpdateAvailableBanner />)
    const title = screen.getByText('TurboPanel update available: control plane v0.1.20')
    const body = screen.getByText(/installs on its own/)
    expect(title.getAttribute('data-lines')).toBe('1')
    expect(body.getAttribute('data-lines')).toBe('2')
  })

  it('has no Update button; See Updates opens Admin > Updates', () => {
    render(<UpdateAvailableBanner />)
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'See Updates' }))
    expect(push).toHaveBeenCalledWith('/admin/updates')
  })
})
