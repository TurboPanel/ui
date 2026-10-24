// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HostingCertificate } from '@/lib/instance-api'
import {
  environmentDeployShortcut,
  HostingCertificateActionsContext,
  HostingCertificatePanel,
  type HostingCertificateActions,
} from './hosting-certificate-panel'

const state = vi.hoisted(() => ({
  certificate: null as unknown,
  requestError: null as unknown,
  lifecycle: null as unknown,
  push: vi.fn(),
  run: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/lib/theme', () => ({ colors: {}, spacing: {} }))
vi.mock('@/components/org/project/overview-environments-panel', () => ({
  useOptionalEnvironmentLifecycle: () => state.lifecycle,
}))
vi.mock('@/lib/queries/hosting-certificate', () => ({
  useHostingCertificate: () => ({
    data: state.certificate ? { hosting: { certificate: state.certificate } } : undefined,
  }),
  useUseLetsEncrypt: () => ({ run: state.run, isPending: false, error: state.requestError }),
  useHostingDnsCheck: () => ({ run: vi.fn(), isPending: false, error: null, data: undefined }),
}))
vi.mock('@/components/ui', () => ({
  Button: (props: {
    label: string
    accessibilityLabel?: string
    disabled?: boolean
    onPress: () => void
  }) => (
    <button
      aria-label={props.accessibilityLabel ?? props.label}
      disabled={props.disabled}
      onClick={props.onPress}
    >
      {props.label}
    </button>
  ),
  ButtonRow: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

function cert(overrides: Partial<HostingCertificate>): HostingCertificate {
  return {
    state: 'test_certificate',
    source: 'test',
    expiresAt: null,
    expiresInDays: null,
    lastIssuedAt: null,
    lastError: null,
    needsDeploy: false,
    letsEncryptAvailable: true,
    uploadedExpiryWarning: 'none',
    dns: null,
    ...overrides,
  } as HostingCertificate
}

function renderPanel(actions: HostingCertificateActions = {}) {
  return render(
    <HostingCertificateActionsContext.Provider value={actions}>
      <HostingCertificatePanel orgId="o1" hostingId="h1" composeOwned={false} disabled={false} />
    </HostingCertificateActionsContext.Provider>
  )
}

const OFF = {
  message:
    'Let’s Encrypt is turned off for this organization. An owner can turn it on in Organization settings › Domains & certificates.',
  openSettings: true,
}

beforeEach(() => {
  state.certificate = cert({})
  state.requestError = null
  state.lifecycle = null
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a refused Let’s Encrypt request after saving', () => {
  it('says Let’s Encrypt is off and links to Domains & certificates', () => {
    renderPanel({ refusals: { h1: OFF } })
    expect(screen.getByText(OFF.message)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Open Organization settings › Domains & certificates'))
    expect(state.push).toHaveBeenCalledWith('/o1/manage?tab=domains')
  })

  it('shows another hosting’s refusal only on that hosting', () => {
    renderPanel({ refusals: { h2: OFF } })
    expect(screen.queryByText(OFF.message)).toBeNull()
  })

  it('shows other refusals in plain words, without the settings link', () => {
    renderPanel({ refusals: { h1: { message: 'Add a domain name first.', openSettings: false } } })
    expect(screen.getByText('Add a domain name first.')).toBeTruthy()
    expect(screen.queryByLabelText(/Domains & certificates/)).toBeNull()
  })

  it('still says why before the certificate has loaded', () => {
    state.certificate = null
    renderPanel({ refusals: { h1: OFF } })
    expect(screen.getByText(OFF.message)).toBeTruthy()
  })

  it('reads the panel’s own Use Let’s Encrypt refusal the same way', () => {
    state.requestError = new Error(
      '/hostings/h1/use-letsencrypt failed: HTTP 403: lets_encrypt_not_enabled'
    )
    renderPanel()
    expect(screen.getByText(OFF.message)).toBeTruthy()
    expect(
      screen.getByLabelText('Open Organization settings › Domains & certificates')
    ).toBeTruthy()
  })
})

describe('the panel’s own Use Let’s Encrypt on a screen that keeps refusals', () => {
  it('clears the refusal from the last save once its own request goes through', async () => {
    state.run.mockResolvedValue({ ok: true, value: {} })
    const onRefusal = vi.fn()
    renderPanel({ refusals: { h1: OFF }, onRefusal })
    expect(screen.getByText(OFF.message)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Use Let’s Encrypt'))
    await waitFor(() => expect(onRefusal).toHaveBeenCalledWith('h1', null))
  })

  it('records its own refusal as the newest one', async () => {
    const off = new Error('/hostings/h1/use-letsencrypt failed: HTTP 403: lets_encrypt_not_enabled')
    state.run.mockResolvedValue({ ok: false, error: off.message, cause: off })
    const onRefusal = vi.fn()
    renderPanel({ refusals: {}, onRefusal })
    fireEvent.click(screen.getByLabelText('Use Let’s Encrypt'))
    await waitFor(() => expect(onRefusal).toHaveBeenCalledWith('h1', OFF))
  })

  it('shows what the screen holds, not a stale error of its own', () => {
    state.requestError = new Error(
      '/hostings/h1/use-letsencrypt failed: HTTP 400: hosting_not_http'
    )
    renderPanel({ refusals: {}, onRefusal: vi.fn() })
    expect(screen.queryByText(/web domains/)).toBeNull()
  })
})

describe('a certificate that starts on the next deploy', () => {
  beforeEach(() => {
    state.certificate = cert({ state: 'issuing', needsDeploy: true })
  })

  it('offers Deploy now from the screen', () => {
    const onDeploy = vi.fn()
    renderPanel({ onDeploy })
    expect(screen.getByText(/Deploy this environment to start it/)).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Deploy this environment to get the certificate'))
    expect(onDeploy).toHaveBeenCalledTimes(1)
  })

  it('uses the environment page’s Deploy when there is one', () => {
    const openDeployConfirm = vi.fn()
    state.lifecycle = {
      canMutateLifecycle: true,
      hasContainers: true,
      hasServer: true,
      busy: false,
      needsPrincipal: false,
      openDeployConfirm,
    }
    const onDeploy = vi.fn()
    renderPanel({ onDeploy })
    fireEvent.click(screen.getByLabelText('Deploy this environment to get the certificate'))
    expect(openDeployConfirm).toHaveBeenCalledWith('redeploy')
    expect(onDeploy).not.toHaveBeenCalled()
  })

  it('keeps only the sentence where nothing can deploy', () => {
    renderPanel()
    expect(screen.getByText(/Deploy this environment to start it/)).toBeTruthy()
    expect(screen.queryByLabelText('Deploy this environment to get the certificate')).toBeNull()
  })

  it('disables Deploy now while a deploy cannot start', () => {
    renderPanel({ onDeploy: vi.fn(), deployDisabled: true })
    const button = screen.getByLabelText('Deploy this environment to get the certificate')
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('environmentDeployShortcut', () => {
  const model = (extra: Record<string, unknown>) =>
    ({
      canMutateLifecycle: true,
      hasContainers: false,
      hasServer: true,
      busy: false,
      needsPrincipal: false,
      openDeployConfirm: vi.fn(),
      ...extra,
    }) as unknown as Parameters<typeof environmentDeployShortcut>[0]

  it('is absent outside an environment page or for someone who cannot deploy', () => {
    expect(environmentDeployShortcut(null)).toBeNull()
    expect(environmentDeployShortcut(model({ canMutateLifecycle: false }))).toBeNull()
  })

  it('deploys a first time, and is disabled like the header’s Deploy', () => {
    const first = model({})
    environmentDeployShortcut(first)?.onDeploy()
    expect(first?.openDeployConfirm).toHaveBeenCalledWith('deploy')
    expect(environmentDeployShortcut(model({ hasServer: false }))?.disabled).toBe(true)
    expect(environmentDeployShortcut(model({ needsPrincipal: true }))?.disabled).toBe(true)
    expect(environmentDeployShortcut(model({}))?.disabled).toBe(false)
  })
})
