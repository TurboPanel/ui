// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationUnsubscribeResult } from '@/lib/instance-api'

const ORG = '00000000-0000-4000-8000-000000000001'
const TOKEN = 'sealed-token-0123456789'

type RunResult =
  { ok: true; value: NotificationUnsubscribeResult } | { ok: false; error: string; cause: unknown }

const state = vi.hoisted(() => ({
  params: {} as { token?: string },
  push: vi.fn(),
  setParams: vi.fn(),
  run: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => state.params,
  useRouter: () => ({ push: state.push, setParams: state.setParams }),
}))
vi.mock('@/components/auth/auth-screen-shell', () => ({
  AuthScreenShell: (props: { title: string; children?: ReactNode }) => (
    <main aria-label={props.title}>{props.children}</main>
  ),
}))
vi.mock('@/components/auth/auth-primary-button', () => ({
  AuthPrimaryButton: (props: { label: string; disabled?: boolean; onPress: () => void }) => (
    <button type="button" disabled={Boolean(props.disabled)} onClick={() => props.onPress()}>
      {props.label}
    </button>
  ),
}))
vi.mock('@/components/auth/auth-form-styles', () => ({ authAccentStyles: () => ({}) }))
vi.mock('@/components/ui', () => ({
  TextLink: (props: { label: string; onPress: () => void }) => (
    <button type="button" onClick={() => props.onPress()}>
      {props.label}
    </button>
  ),
}))
vi.mock('@/lib/auth-accent', () => ({
  authAccentForRuntime: () => ({ accent: 'accent' }),
  resolveControlPlaneRuntime: () => 'deno',
}))
vi.mock('@/lib/query-client', () => ({ useAuthStatus: () => ({ data: undefined }) }))
vi.mock('@/lib/theme', () => ({ colors: new Proxy({}, { get: () => 'token' }) }))
vi.mock('@/lib/queries/notification-preferences', () => ({
  useNotificationUnsubscribe: () => ({ run: state.run, isPending: false }),
}))

const { UnsubscribeScreenContent } = await import('./unsubscribe-screen')

function answer(result: RunResult) {
  state.run.mockResolvedValue(result)
}

beforeEach(() => {
  state.params = { token: TOKEN }
  // Taking the token out of the address is what the screen then sees.
  state.setParams.mockImplementation((next: { token?: string }) => {
    state.params = { ...state.params, ...next }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('the unsubscribe page', () => {
  it('sends nothing when it opens: a link scanner must not unsubscribe anyone', () => {
    const { rerender } = render(<UnsubscribeScreenContent />)
    rerender(<UnsubscribeScreenContent />)
    expect(state.run).not.toHaveBeenCalled()
    expect(state.setParams).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeTruthy()
  })

  it('posts the token once on the press, names the category, and drops the token from the address', async () => {
    answer({ ok: true, value: { ok: true, organizationId: ORG, categoryCode: 'servers' } })
    const { rerender } = render(<UnsubscribeScreenContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await screen.findByText('You are unsubscribed')
    expect(state.run).toHaveBeenCalledTimes(1)
    expect(state.run).toHaveBeenCalledWith(TOKEN)
    expect(screen.getByText(/^Servers emails are turned off for this organization\./)).toBeTruthy()
    expect(screen.getByText(/remove the Servers setting that says Off/)).toBeTruthy()
    expect(state.setParams).toHaveBeenCalledWith({ token: undefined })

    // The address has no token any more; the result must stay, not turn into
    // "this link is missing its token".
    rerender(<UnsubscribeScreenContent />)
    expect(screen.getByText('You are unsubscribed')).toBeTruthy()
    expect(screen.queryByText(/missing its token/)).toBeNull()

    // The link lands on the organization's tab, where that setting is listed with Remove.
    fireEvent.click(screen.getByRole('button', { name: 'Open Notification Settings' }))
    expect(state.push).toHaveBeenCalledWith(`/${ORG}/manage?tab=notifications`)
  })

  it('an unsubscribe that names no organization links to the account settings', async () => {
    answer({ ok: true, value: { ok: true, organizationId: null, categoryCode: 'platform' } })
    render(<UnsubscribeScreenContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await screen.findByText(/^Control Plane emails are turned off\./)
    fireEvent.click(screen.getByRole('button', { name: 'Open Notification Settings' }))
    expect(state.push).toHaveBeenCalledWith('/account/notifications')
  })

  it('keeps the token in the address when the link did not work, so nothing looks done', async () => {
    answer({ ok: true, value: { ok: false, reason: 'invalid_or_expired' } })
    render(<UnsubscribeScreenContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await screen.findByText('This link does not work any more')
    expect(state.setParams).not.toHaveBeenCalled()
  })

  it('says so when the control plane cannot be reached, and lets the person try again', async () => {
    answer({ ok: false, error: 'The unsubscribe request failed', cause: new Error('x') })
    render(<UnsubscribeScreenContent />)
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await screen.findByText(/could not be reached/)
    expect(state.setParams).not.toHaveBeenCalled()
    answer({ ok: true, value: { ok: true, organizationId: null, categoryCode: null } })
    fireEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(2))
    await screen.findByText(/^These emails are turned off\./)
  })

  it('a link with no token offers no button', () => {
    state.params = {}
    render(<UnsubscribeScreenContent />)
    expect(screen.getByText(/missing its token/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).toBeNull()
    expect(state.run).not.toHaveBeenCalled()
  })
})
