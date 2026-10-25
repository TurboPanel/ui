// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({ switcher: false, forget: { calls: 0 } }))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {}, flatten: (s: unknown) => s },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  View: ({ children, accessibilityRole, accessibilityLabel }: Props) => (
    <div role={accessibilityRole as string} aria-label={accessibilityLabel as string}>
      {children}
    </div>
  ),
  Text: ({ children }: Props) => <span>{children}</span>,
  Pressable: ({ children, onPress, accessibilityRole, accessibilityLabel }: Props) => (
    <button
      type="button"
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      onClick={onPress as () => void}
    >
      {typeof children === 'function' ? (children as (s: object) => ReactNode)({}) : children}
    </button>
  ),
}))
vi.mock('react-native-svg', () => ({
  default: () => null,
  Circle: () => null,
  Path: () => null,
  Rect: () => null,
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ clear: vi.fn() }) }))
vi.mock('@/components/account-avatar', () => ({ AccountAvatar: () => null }))
vi.mock('@/components/glass/glass-surface', () => ({
  GlassSurface: ({ children }: Props) => <div>{children}</div>,
}))
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/header-menu-trigger', () => ({
  HeaderMenuTrigger: ({ children, onPress, accessibilityLabel }: Props) => (
    <button type="button" aria-label={accessibilityLabel as string} onClick={onPress as () => void}>
      {children}
    </button>
  ),
}))
vi.mock('@/components/header-menu-overlay', () => ({
  HeaderMenuOverlay: ({ open, children }: Props) => (open ? <div>{children}</div> : null),
}))
vi.mock('@/components/notifications-panel-body', () => ({ NotificationsPanelBody: () => null }))
vi.mock('@/components/ui-settings-panel', () => ({
  UiSettings: () => <button type="button">UI settings</button>,
}))
vi.mock('@/lib/control-plane', () => ({
  formatControlPlaneHostLabel: (origin: string) => origin,
  isRemoteCookieClient: () => state.switcher,
}))
vi.mock('@/lib/control-plane-accounts', () => ({
  switchControlPlaneAccount: vi.fn(() => true),
  useControlPlaneStore: () => ({
    accounts: [
      { kind: 'self-hosted', origin: 'https://one.example', email: 'a@b.c' },
      { kind: 'self-hosted', origin: 'https://two.example', email: 'd@e.f' },
    ],
    activeOrigin: 'https://one.example',
  }),
}))
vi.mock('@/lib/session-choices', () => ({
  forgetSessionChoices: () => {
    state.forget.calls += 1
  },
}))
vi.mock('@/lib/notifications', () => ({ useUnreadNotificationCount: () => 0 }))
vi.mock('@/lib/org-context', () => ({ setActiveOrganizationId: vi.fn() }))

async function openMenu() {
  vi.resetModules()
  const { UserAccountMenuSegment } = await import('@/components/user-account-menu')
  render(<UserAccountMenuSegment email="owner@example.com" onSignOut={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Account menu for owner@example.com' }))
}

beforeEach(() => {
  state.switcher = false
})
afterEach(cleanup)

describe('UserAccountMenuSegment', () => {
  it('lists Security, Notifications, About, Sign out, then UI settings', async () => {
    await openMenu()
    const names = screen
      .getAllByRole('menuitem')
      .map((el) => el.getAttribute('aria-label'))
    expect(names).toEqual(['Security', 'Notifications', 'About', 'Sign out'])
    const all = Array.from(document.querySelectorAll('button')).map(
      (el) => el.getAttribute('aria-label') ?? el.textContent,
    )
    expect(all.at(-1)).toBe('UI settings')
  })

  it('hides "Signed in as" unless the control-plane switcher is shown', async () => {
    await openMenu()
    expect(screen.queryByText('Signed in as')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Add control plane' })).toBeNull()
  })

  it('shows "Signed in as" and Add control plane with the switcher', async () => {
    state.switcher = true
    await openMenu()
    expect(screen.getByText('Signed in as')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Add control plane' })).toBeTruthy()
  })

  it('forgets the remembered form choices when switching control plane', async () => {
    state.switcher = true
    state.forget.calls = 0
    await openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch to d@e.f' }))
    expect(state.forget.calls).toBe(1)
  })
})
