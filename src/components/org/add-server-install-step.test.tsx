// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallStep } from './add-server-wizard'

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
vi.mock('@/components/ui', () => ({
  Button: ({ label }: { label: string }) => <button type="button">{label}</button>,
  ButtonRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CopyButton: ({ label }: { label: string }) => <button type="button">{label}</button>,
  LoadingState: () => null,
  SectionPanel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  TextField: () => null,
}))
vi.mock('@/components/ui/wizard-steps', () => ({ WizardSteps: () => null }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: null }) }))
vi.mock('@/components/org/add-server-tier-section', () => ({ AddServerTierSection: () => null }))
vi.mock('@/lib/queries/admin', () => ({ usePublicUrlsOptional: () => ({ data: undefined }) }))
vi.mock('@/lib/queries/servers', () => ({
  useCreateLicense: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useOrgLicenses: () => ({ data: undefined }),
  useOrgServers: () => ({ data: undefined }),
}))

const COMMAND = 'curl -fsSL https://turbopanel.sh | TOKEN=abc.def sh'

describe('InstallStep', () => {
  const globals = globalThis as { __DEV__?: boolean }
  beforeEach(() => {
    // A production build: the development-only address fields stay out.
    globals.__DEV__ = false
  })
  afterEach(() => {
    cleanup()
    delete globals.__DEV__
  })

  it('shows the install command and no key fingerprint lines', () => {
    render(
      <InstallStep
        installBaseUrl="https://panel.example.com:8443"
        managedUrls={[]}
        displayedInstallCommand={COMMAND}
        onInstallBaseUrlChange={() => {}}
        onContinue={() => {}}
      />
    )
    expect(screen.getByText(COMMAND)).toBeTruthy()
    expect(screen.getByText(/Run this command on your new server/)).toBeTruthy()
    expect(screen.queryByText('Control Plane Key')).toBeNull()
    expect(screen.queryByText('Next Key')).toBeNull()
    expect(screen.queryByText(/only trust a control plane that signs with this key/)).toBeNull()
  })
})
