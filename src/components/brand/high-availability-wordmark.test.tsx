// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HighAvailabilityWordmark } from '@/components/brand/high-availability-wordmark'
import type { HealthResponse } from '@/lib/instance-api'

const { useAuth, useVersionUpdateEntry, push, healthState } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useVersionUpdateEntry: vi.fn(),
  push: vi.fn(),
  healthState: { data: undefined as HealthResponse | undefined },
}))

vi.mock('@/lib/auth-context', () => ({ useAuth }))
vi.mock('@/lib/queries/system', () => ({ useControlPlaneHealth: () => healthState }))
vi.mock('@/lib/theme-preference', () => ({
  useColors: () => ({ brand: '#00f', link: '#08f' }),
  useColorScheme: () => 'light',
}))
vi.mock('@/components/brand/use-version-update-entry', () => ({ useVersionUpdateEntry }))
vi.mock('@/components/brand/versions-sheet', () => ({
  VersionsSheet: ({ visible }: { visible: boolean }) =>
    visible ? <div>Versions popup</div> : null,
}))
vi.mock('@/components/icons/nav-icons', () => ({ UpdatesNavIcon: () => <span>update icon</span> }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
// The real components are React Native; plain elements keep the style prop.
vi.mock('react-native', () => {
  const flat = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flat))
      : ((style as Record<string, unknown> | undefined) ?? {})
  const box = ({ children, style }: { children?: React.ReactNode; style?: unknown }) => (
    <div style={flat(style)}>{children}</div>
  )
  const pressable = ({
    children,
    style,
    onPress,
    accessibilityLabel,
  }: {
    children?: React.ReactNode
    style?: unknown
    onPress?: () => void
    accessibilityLabel?: string
  }) => (
    <button type="button" style={flat(style)} onClick={onPress} aria-label={accessibilityLabel}>
      {children}
    </button>
  )
  return {
    View: box,
    Text: box,
    Pressable: pressable,
    Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
    StyleSheet: { create: (styles: unknown) => styles },
  }
})
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }: { children: React.ReactNode; style?: unknown }) => (
    <div style={Object.assign({}, ...[style].flat(3).filter(Boolean))}>{children}</div>
  ),
}))

const COMMIT = '5efa9c1d0f6b4a3e2c1b0a9f8e7d6c5b4a3f2e1d'

function versionButton(): HTMLElement {
  return screen.getByRole('button')
}

describe('HighAvailabilityWordmark', () => {
  beforeEach(() => {
    healthState.data = undefined
    push.mockReset()
    useVersionUpdateEntry.mockReturnValue({ viewer: 'other', pending: false })
  })
  afterEach(cleanup)

  it('renders nothing while the runtime is unknown, so a caller keeps no empty box', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: null })
    const { container } = render(<HighAvailabilityWordmark style={{ top: 2 }} />)
    expect(container.innerHTML).toBe('')
  })

  it('applies the caller style to its own root on the hosted control plane', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    const { container } = render(<HighAvailabilityWordmark style={{ top: 2 }} />)
    expect(container.innerHTML).toContain('top: 2px')
  })

  it('shows the running build and the yellow Testing word on hosted testing, never the commit', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    healthState.data = {
      ok: true,
      version: '0.1.21',
      build: '0.1.21-canary.3',
      environment: 'testing',
      channel: 'canary',
      revision: { commit: COMMIT, sourceUrl: '' },
    }
    const { container } = render(<HighAvailabilityWordmark />)
    expect(container.textContent).toContain('HIGH AVAILABILITY')
    expect(container.textContent).toContain('v0.1.21-canary.3')
    expect(container.textContent).toContain('Testing')
    expect(container.textContent).not.toContain('5efa9c1')
    expect(container.textContent).not.toContain('update icon')
  })

  it('opens the versions popup when there is nothing to apply', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'workers' })
    healthState.data = { ok: true, version: '0.1.20', environment: 'live' }
    render(<HighAvailabilityWordmark />)
    expect(screen.queryByText('Versions popup')).toBeNull()
    fireEvent.click(versionButton())
    expect(screen.getByText('Versions popup')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('self-hosted release: an instance admin sees the icon and "Update", and goes to Admin > Updates', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'deno' })
    useVersionUpdateEntry.mockReturnValue({ viewer: 'instance-admin', pending: true })
    healthState.data = { ok: true, version: '0.1.20', build: '0.1.20', channel: 'release' }
    const { container } = render(<HighAvailabilityWordmark orgId="org-1" />)
    expect(container.textContent).toBe('v0.1.20update iconUpdate')
    fireEvent.click(versionButton())
    expect(push).toHaveBeenCalledWith('/admin/updates')
  })

  it('self-hosted canary: an organization manager sees the icon alone and goes to the Servers page', () => {
    useAuth.mockReturnValue({ controlPlaneRuntime: 'deno' })
    useVersionUpdateEntry.mockReturnValue({ viewer: 'org-manager', pending: true })
    healthState.data = { ok: true, version: '0.1.21', build: '0.1.21-canary.24', channel: 'canary' }
    const { container } = render(<HighAvailabilityWordmark orgId="org-1" />)
    expect(container.textContent).toBe('v0.1.21-canary.24Canaryupdate icon')
    expect(versionButton().getAttribute('aria-label')).toBe(
      'Control plane v0.1.21-canary.24, Canary build, update available, open Servers'
    )
    fireEvent.click(versionButton())
    expect(push).toHaveBeenCalledWith('/org-1/servers')
  })
})
