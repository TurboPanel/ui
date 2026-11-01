// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InstanceIdentity } from '@/lib/instance-api'
import { PanelIdentitySection } from './panel-identity-section'

const { useAuth, useInstanceIdentity } = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useInstanceIdentity: vi.fn(),
}))

const CURRENT = 'C'.repeat(43)
const NEXT = 'N'.repeat(43)
const SEAL = 'S'.repeat(43)

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/auth-context', () => ({
  useAuth,
  isSuperadminSession: (session: { role?: string } | null) => session?.role === 'superadmin',
}))
vi.mock('@/lib/queries/admin', () => ({
  useInstanceIdentity,
  useSaveInstanceIdentityNext: () => ({ run: vi.fn(), isPending: false }),
}))
// The real components are React Native; only their text matters here.
vi.mock('@/components/ui', () => {
  return {
    ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ConfirmButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
    FingerprintLine: ({
      label,
      value,
      fallback = 'Not set',
    }: {
      label: string
      value?: string | null
      fallback?: string
    }) => (
      <p>
        <b>{label}</b>
        <span>{value ?? fallback}</span>
      </p>
    ),
    InlineNotice: ({ title, body }: { title: string; body: string }) => (
      <p>
        {title} {body}
      </p>
    ),
    LoadingState: () => <span>Loading</span>,
    SectionPanel: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <section>
        <h2>{title}</h2>
        {children}
      </section>
    ),
    TextField: ({ label }: { label: string }) => <input aria-label={label} />,
  }
})
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { pageTitle: {}, pageCopy: {}, muted: {}, error: {} },
}))

function identity(over: Partial<InstanceIdentity> = {}): InstanceIdentity {
  return {
    ok: true,
    configured: true,
    current: { fingerprint: CURRENT, keyset: 3 },
    next: { fingerprint: NEXT },
    seal: { fingerprint: SEAL },
    urls: ['https://cp.example.com'],
    installUrl: 'https://cp.example.com',
    servers: [],
    ...over,
  }
}

function setup(data: InstanceIdentity | undefined, role = 'superadmin', runtime = 'deno') {
  useAuth.mockReturnValue({ session: { role }, controlPlaneRuntime: runtime })
  useInstanceIdentity.mockReturnValue({
    data,
    isLoading: data === undefined,
    isError: false,
    error: null,
  })
  render(<PanelIdentitySection />)
}

describe('PanelIdentitySection', () => {
  afterEach(cleanup)

  it('shows both fingerprints, the key set and the install address', () => {
    setup(identity())
    expect(screen.getByText(CURRENT)).toBeTruthy()
    expect(screen.getByText(NEXT)).toBeTruthy()
    expect(screen.getByText(SEAL)).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('https://cp.example.com')).toBeTruthy()
  })

  it('says Not set when there is no next key', () => {
    setup(identity({ next: null }))
    expect(screen.getByText('Not set')).toBeTruthy()
    expect(screen.queryByText('Clear Next Key')).toBeNull()
  })

  it('lets a superadmin change the next key', () => {
    setup(identity())
    expect(screen.getByText('Save Next Key')).toBeTruthy()
    expect(screen.getByText('Clear Next Key')).toBeTruthy()
  })

  it('hides the edit controls from another admin', () => {
    setup(identity(), 'admin')
    expect(screen.queryByText('Save Next Key')).toBeNull()
    expect(screen.getByText(/Only the superadmin can change these settings/)).toBeTruthy()
  })

  it('hides the edit controls on High Availability', () => {
    setup(identity(), 'superadmin', 'workers')
    expect(screen.queryByText('Save Next Key')).toBeNull()
    expect(screen.getByText(CURRENT)).toBeTruthy()
  })

  it('explains the off state when no identity key exists', () => {
    setup(identity({ configured: false, current: null, next: null, seal: null }))
    expect(screen.getByText(/Control plane identity is off/)).toBeTruthy()
    expect(screen.queryByText(CURRENT)).toBeNull()
  })
})
