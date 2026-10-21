// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebhookStep } from './github-app-wizard'
import {
  type WebhookOriginsState,
  WEBHOOK_ORIGINS_LOAD_ERROR,
  WEBHOOK_ORIGINS_LOADING,
} from '@/lib/git-webhook-url'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/org/form-select', () => ({
  FormSelect: ({ options }: { options: { value: string }[] }) => (
    <select aria-label="Webhook endpoint">
      {options.map((option) => (
        <option key={option.value}>{option.value}</option>
      ))}
    </select>
  ),
}))
vi.mock('@/components/ui', () => {
  const Wrap = ({ children }: { children?: unknown }) => <div>{children as never}</div>
  return {
    Button: ({ label, disabled }: { label: string; disabled?: boolean }) => (
      <button disabled={disabled}>{label}</button>
    ),
    ButtonRow: Wrap,
    Checkbox: () => null,
    FormField: Wrap,
    InlineNotice: ({ title, body }: { title: string; body: string }) => (
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    ),
    LoadingState: ({ label }: { label?: string }) => <span role="progressbar">{label}</span>,
    MonoText: Wrap,
    SectionPanel: Wrap,
    SegmentedControl: () => null,
    TextField: () => null,
    WizardSteps: () => null,
  }
})
vi.mock('@/lib/queries/admin', () => ({
  useForgeWebhookOrigins: vi.fn(),
  useStartGithubAppManifest: vi.fn(),
}))

afterEach(cleanup)

function renderStep(originsState: WebhookOriginsState) {
  render(
    <WebhookStep
      originsState={originsState}
      resolvedOrigin={originsState.kind === 'ready' ? (originsState.origins[0] ?? '') : ''}
      previewUrl={null}
      onOriginChange={() => {}}
      pullRequests="read"
      onPullRequestsChange={() => {}}
      busy={false}
      onBack={() => {}}
      onRegister={() => {}}
    />,
  )
}

function registerButton(): HTMLButtonElement {
  return screen.getByText('Register with GitHub') as HTMLButtonElement
}

describe('GitHub App wizard webhook step', () => {
  it('shows a loading row, not the empty notice, while the addresses load', () => {
    renderStep({ kind: 'loading' })
    expect(screen.getByRole('progressbar').textContent).toBe(WEBHOOK_ORIGINS_LOADING)
    expect(screen.queryByText(/Networking/)).toBeNull()
    expect(registerButton().disabled).toBe(true)
  })

  it('shows an error notice, not the empty notice, when the read fails', () => {
    renderStep({ kind: 'error' })
    expect(screen.getByText(WEBHOOK_ORIGINS_LOAD_ERROR.title)).toBeTruthy()
    expect(screen.queryByText(/Networking/)).toBeNull()
    expect(registerButton().disabled).toBe(true)
  })

  it('keeps the Networking advice for an empty self-hosted list', () => {
    renderStep({ kind: 'ready', origins: [], platformManaged: false })
    expect(screen.getByText(/under Networking/)).toBeTruthy()
    expect(registerButton().disabled).toBe(true)
  })

  it('never mentions Networking for an empty hosted list', () => {
    renderStep({ kind: 'ready', origins: [], platformManaged: true })
    expect(screen.getByText('No webhook address yet')).toBeTruthy()
    expect(screen.queryByText(/Networking/)).toBeNull()
  })

  it('offers the published addresses once they are known', () => {
    renderStep({ kind: 'ready', origins: ['https://panel.example.com'], platformManaged: true })
    expect(screen.getByLabelText('Webhook endpoint').textContent).toBe('https://panel.example.com')
    expect(registerButton().disabled).toBe(false)
  })
})
