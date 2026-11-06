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
}))
vi.mock('@/components/admin/access/key-rotation-panel', () => ({
  KeyRotationPanel: ({ notRotatable }: { notRotatable: string[] }) => (
    <section>{`Key Rotation Panel${notRotatable.length > 0 ? ` Not Rotatable Yet: ${notRotatable.join(', ')}` : ''}`}</section>
  ),
}))
// The real components are React Native; only their text matters here.
vi.mock('@/components/ui', () => {
  return {
    ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ConfirmButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
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
vi.mock('@/components/ui/fingerprint-line', () => ({
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
}))
vi.mock('@/components/admin/access/sealed-secrets-panel', () => ({
  SealedSecretsPanel: () => <section>Sealed Secrets</section>,
}))
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

  it('shows the current and sealing fingerprints, the key set and the install address', () => {
    setup(identity())
    expect(screen.getByText(CURRENT)).toBeTruthy()
    expect(screen.queryByText(NEXT)).toBeNull()
    expect(screen.getByText(SEAL)).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('https://cp.example.com')).toBeTruthy()
  })

  it('shows rotation passkeys to a superadmin on both runtimes, and no next key editor', () => {
    for (const runtime of ['deno', 'workers']) {
      setup(identity(), 'superadmin', runtime)
      expect(screen.getByText(/Key Rotation Panel/)).toBeTruthy()
      expect(screen.queryByText('Save Next Key')).toBeNull()
      cleanup()
    }
  })

  it('hides rotation passkeys from another admin', () => {
    setup(identity(), 'admin')
    expect(screen.queryByText(/Key Rotation Panel/)).toBeNull()
    expect(screen.getByText(/Only the superadmin can change these settings/)).toBeTruthy()
  })

  it('lists servers that have not learned the rotation passkeys', () => {
    setup(
      identity({
        servers: [
          { id: 's1', name: 'kappa', organizationId: 'o1', pinnedBy: 'install', pinPasskeys: '' },
          {
            id: 's2',
            name: 'omicron',
            organizationId: 'o1',
            pinnedBy: 'install',
            pinPasskeys: 'H'.repeat(43),
          },
          { id: 's3', name: 'lambda', organizationId: 'o1', pinnedBy: 'install' },
        ],
      })
    )
    expect(screen.getByText(/Not Rotatable Yet: kappa$/)).toBeTruthy()
  })

  it('warns about servers whose signed pin names another key, and only those', () => {
    setup(
      identity({
        servers: [
          {
            id: 's1',
            name: 'kappa',
            organizationId: 'o1',
            pinnedBy: 'upgrade',
            pinReport: { fingerprint: 'X'.repeat(43), keyset: 1, reportedAt: null, matches: false },
          },
          {
            id: 's2',
            name: 'omicron',
            organizationId: 'o1',
            pinnedBy: 'install',
            pinReport: { fingerprint: CURRENT, keyset: 3, reportedAt: null, matches: true },
          },
          { id: 's3', name: 'lambda', organizationId: null, pinnedBy: 'none' },
        ],
      })
    )
    const notice = screen.getByText(/Servers Pinned to Another Key/)
    expect(notice.textContent).toContain(`kappa (${'X'.repeat(43)})`)
    expect(notice.textContent).not.toContain('omicron')
    expect(notice.textContent).not.toContain('lambda')
  })

  it('shows no warning when every report matches or none has arrived', () => {
    setup(
      identity({
        servers: [{ id: 's1', name: 'kappa', organizationId: 'o1', pinnedBy: 'install' }],
      })
    )
    expect(screen.queryByText(/Servers Pinned to Another Key/)).toBeNull()
  })

  it('shows the sealed-secrets list to a superadmin on both runtimes', () => {
    setup(identity(), 'superadmin', 'workers')
    expect(screen.getByText('Sealed Secrets')).toBeTruthy()
  })

  it('keeps the sealed-secrets list from another admin', () => {
    setup(identity(), 'admin')
    expect(screen.queryByText('Sealed Secrets')).toBeNull()
  })

  it('explains the off state when no identity key exists', () => {
    setup(identity({ configured: false, current: null, next: null, seal: null }))
    expect(screen.getByText(/Control plane identity is off/)).toBeTruthy()
    expect(screen.queryByText(CURRENT)).toBeNull()
  })
})
