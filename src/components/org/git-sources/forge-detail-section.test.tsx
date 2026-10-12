// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebhookPanel } from './forge-detail-section'
import { WEBHOOK_ORIGINS_LOAD_ERROR, WEBHOOK_ORIGINS_LOADING } from '@/lib/git-webhook-url'
import type { ForgeSummary } from '@/lib/instance-api'

const { useForgeWebhookOrigins } = vi.hoisted(() => ({ useForgeWebhookOrigins: vi.fn() }))

vi.mock('react-native', async () => ({
  ...(await import('@/components/ui/v4/rn-stub')).reactNativeStub,
  Linking: { openURL: vi.fn() },
}))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  Badge: () => null,
  Button: ({ label }: { label: string }) => <button>{label}</button>,
  ButtonRow: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
  CopyButton: () => null,
  MonoText: ({ children }: { children?: unknown }) => <span>{children as never}</span>,
  LoadingState: ({ label }: { label?: string }) => <span role="progressbar">{label}</span>,
  InlineNotice: ({ title, body }: { title: string; body: string }) => (
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  ),
}))
vi.mock('@/lib/queries/admin', () => ({
  useForgeWebhookOrigins,
  useForges: () => ({ data: [] }),
  useSyncForge: () => ({ isPending: false }),
}))
vi.mock('@/lib/queries/releases', () => ({ useGitConnections: () => ({ data: [] }) }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function app(webhookUrl: string | null): ForgeSummary {
  return {
    id: 'app-1',
    provider: 'github',
    name: 'TurboPanel',
    baseUrl: 'https://github.com',
    webhookRef: 'ref-1',
    webhookUrl,
  } as ForgeSummary
}

describe('forge detail webhook panel', () => {
  it('shows a loading row, not the empty notice, while the addresses load', () => {
    useForgeWebhookOrigins.mockReturnValue({ data: undefined, isError: false })
    render(<WebhookPanel app={app(null)} scope="org" />)
    expect(screen.getByRole('progressbar').textContent).toBe(WEBHOOK_ORIGINS_LOADING)
    expect(screen.queryByText(/Networking|public URL/)).toBeNull()
  })

  it('shows an error notice, not the empty notice, when the read fails', () => {
    useForgeWebhookOrigins.mockReturnValue({ data: undefined, isError: true })
    render(<WebhookPanel app={app(null)} scope="org" />)
    expect(screen.getByText(WEBHOOK_ORIGINS_LOAD_ERROR.title)).toBeTruthy()
    expect(screen.queryByText(/public URL/)).toBeNull()
  })

  it('keeps the self-hosted advice for an empty list', () => {
    useForgeWebhookOrigins.mockReturnValue({
      data: { origins: [], platformManaged: false },
      isError: false,
    })
    render(<WebhookPanel app={app(null)} scope="org" />)
    expect(screen.getByText('No public URL configured')).toBeTruthy()
  })

  it('never points the hosted control plane at Networking', () => {
    useForgeWebhookOrigins.mockReturnValue({
      data: { origins: [], platformManaged: true },
      isError: false,
    })
    render(<WebhookPanel app={app('https://panel.example.com/webhook/github')} scope="admin" />)
    expect(screen.getByText('https://panel.example.com/webhook/github')).toBeTruthy()
    expect(screen.queryByText(/Networking/)).toBeNull()
    expect(useForgeWebhookOrigins).toHaveBeenCalledWith('admin')
  })

  it('shows the URL with no notice once a public address is known', () => {
    useForgeWebhookOrigins.mockReturnValue({
      data: { origins: ['https://panel.example.com'], platformManaged: true },
      isError: false,
    })
    render(<WebhookPanel app={app('https://panel.example.com/webhook/github')} scope="org" />)
    expect(screen.getByText('https://panel.example.com/webhook/github')).toBeTruthy()
    expect(screen.queryByText(/Deliveries may not reach/)).toBeNull()
  })
})
