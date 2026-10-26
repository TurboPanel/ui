// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComposeHostnameActions } from '@/components/org/project/compose-hostname-actions'
import { CONFIRM_GUARD_MS } from '@/components/ui/confirm-button'

const push = vi.fn()
vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/button', () => ({
  Button: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui/text-link', () => ({
  TextLink: ({ label, onPress }: Readonly<{ label: string; onPress: () => void }>) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
}))

// A fake clock, moved past the confirm guard before each deliberate confirm.
beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z') })
})
afterEach(() => {
  cleanup()
  push.mockReset()
  vi.useRealTimers()
})

function pastConfirmGuard() {
  vi.setSystemTime(Date.now() + CONFIRM_GUARD_MS)
}

function renderActions(overrides: Partial<Parameters<typeof ComposeHostnameActions>[0]> = {}) {
  const onRemove = vi.fn()
  const onManageHere = vi.fn()
  render(
    <ComposeHostnameActions
      composeServiceName="website"
      entry={{ hostname: 'example.test', tls: { mode: 'automatic' } }}
      editable
      state="deployed"
      configurationHref="/compose?hosting=website"
      busy={false}
      disabled={false}
      error={null}
      onRemove={onRemove}
      onManageHere={onManageHere}
      {...overrides}
    />
  )
  return { onRemove, onManageHere }
}

describe('ComposeHostnameActions', () => {
  it('says where the hostname is set without raw configuration words', () => {
    renderActions()
    expect(screen.getByText(/this environment’s configuration file/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/x-turbopanel|tls\.mode/)
  })

  it('shows the exact configuration on request, with a link to the Compose editor', () => {
    renderActions()
    fireEvent.click(screen.getByText('Show in configuration'))
    expect(document.body.textContent).toContain('x-turbopanel:')
    expect(document.body.textContent).toContain('mode: automatic')
    fireEvent.click(screen.getByText('Open in the Compose editor'))
    expect(push).toHaveBeenCalledWith('/compose?hosting=website')
    fireEvent.click(screen.getByText('Hide configuration'))
    expect(document.body.textContent).not.toContain('x-turbopanel:')
  })

  it('removes the hostname only after confirming', () => {
    const { onRemove, onManageHere } = renderActions()
    fireEvent.click(screen.getByText('Remove hostname'))
    expect(
      screen.getByText('Remove example.test? It stops being served after the next deploy.')
    ).toBeTruthy()
    expect(onRemove).not.toHaveBeenCalled()
    pastConfirmGuard()
    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledTimes(1)
    expect(onManageHere).not.toHaveBeenCalled()
  })

  it('moves the hostname to this screen only after confirming', () => {
    const { onManageHere } = renderActions()
    fireEvent.click(screen.getByText('Manage on this screen instead'))
    expect(screen.getByText(/as last deployed/)).toBeTruthy()
    pastConfirmGuard()
    fireEvent.click(screen.getByText('Move it here'))
    expect(onManageHere).toHaveBeenCalledTimes(1)
  })

  it('says a taken-over hostname goes back to this screen when removed', () => {
    renderActions({ state: 'adopted' })
    fireEvent.click(screen.getByText('Remove hostname'))
    expect(screen.getByText(/managed on this screen again/)).toBeTruthy()
  })

  it('says a hostname the panel already holds keeps being served when removed', () => {
    renderActions({ state: 'held-by-panel' })
    fireEvent.click(screen.getByText('Remove hostname'))
    expect(screen.getByText(/keeps being served/)).toBeTruthy()
  })

  it('offers no actions for a hostname the shared file sets, only where to change it', () => {
    renderActions({ editable: false, configurationHref: '/base/compose' })
    expect(screen.queryByText('Remove hostname')).toBeNull()
    expect(screen.queryByText('Manage on this screen instead')).toBeNull()
    expect(screen.getByText(/Base tab/)).toBeTruthy()
  })

  it('shows a failed action right under its buttons', () => {
    renderActions({ error: 'The compose file could not be saved.' })
    expect(screen.getByText('The compose file could not be saved.')).toBeTruthy()
  })
})
