// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ServiceTerminalPanel, terminalContainer } from './service-terminal-panel'

const state = vi.hoisted(() => ({
  containers: [] as unknown[],
  server: undefined as unknown,
  can: {} as Record<string, boolean>,
  push: vi.fn(),
  openError: null as unknown,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: state.push }) }))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/lib/queries/containers', () => ({
  useContainers: () => ({ data: { containers: state.containers } }),
}))
vi.mock('@/lib/queries/servers', () => ({ useServerDetail: () => ({ data: state.server }) }))
vi.mock('@/lib/query-client', () => ({
  useCan: (type: string, _id: string, key: string) => state.can[`${type}:${key}`] ?? false,
}))
vi.mock('@/components/ui/v4/section', () => ({
  Section: ({ title, children }: { title: string; children?: unknown }) => (
    <section>
      <h2>{title}</h2>
      {children as never}
    </section>
  ),
}))
vi.mock('@/components/terminal/terminal-view', () => ({
  TerminalView: ({ onOpenError }: { onOpenError: (e: unknown) => void }) => (
    <button onClick={() => onOpenError(state.openError)}>fail open</button>
  ),
}))
vi.mock('@/components/ui', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  TextLink: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button onClick={onPress}>{label}</button>
  ),
  TextField: ({
    label,
    value,
    onChangeText,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
  }) => <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />,
}))

const running = { id: 'c1', serverId: 's1', role: 'service', status: 'running', containerId: 'abc' }
const onServer = { id: 's1', trustPinnedBy: 'install', options: { terminal: { container: true } } }

beforeEach(() => {
  state.containers = [running]
  state.server = onServer
  state.can = { 'container:terminal:container': true, 'organization:organization:manage': false }
  state.push.mockReset()
})
afterEach(() => cleanup())

describe('Terminal entry on a service', () => {
  it('shows when the switch is on, the person may open one and the server is pinned', () => {
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(screen.getByText('Open Terminal')).toBeTruthy()
    expect(screen.getByLabelText('Login User')).toBeTruthy()
  })

  it.each([
    ['the switch is off', () => (state.server = { ...onServer, options: {} })],
    ['the server is not pinned', () => (state.server = { ...onServer, trustPinnedBy: 'none' })],
    ['the person has no permission', () => (state.can = {})],
    ['no container is running', () => (state.containers = [{ ...running, status: 'exited' }])],
    ['the server is not loaded', () => (state.server = undefined)],
  ])('hides when %s', (_name, change) => {
    change()
    const { container } = render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(container.textContent).toBe('')
  })

  it('shows the plain words and a settings link to a manager when the switch is off', () => {
    state.can['organization:organization:manage'] = true
    state.openError = new Error('/x failed: HTTP 403: terminal_disabled')
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    fireEvent.click(screen.getByText('Open Terminal'))
    fireEvent.click(screen.getByText('fail open'))
    expect(screen.getByText('Terminal is turned off for this server.')).toBeTruthy()
    fireEvent.click(screen.getByText('Open server settings'))
    expect(state.push).toHaveBeenCalledWith('/o/servers/s1')
  })

  it('gives no settings link to someone who cannot manage', () => {
    state.openError = new Error('/x failed: HTTP 403: terminal_disabled')
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    fireEvent.click(screen.getByText('Open Terminal'))
    fireEvent.click(screen.getByText('fail open'))
    expect(screen.getByText('Terminal is turned off for this server.')).toBeTruthy()
    expect(screen.queryByText('Open server settings')).toBeNull()
  })

  it('picks only a running service container with a Docker id', () => {
    expect(terminalContainer([{ ...running, containerId: ' ' }] as never)).toBeNull()
    expect(terminalContainer([{ ...running, role: 'ingress' }] as never)).toBeNull()
    expect(terminalContainer([running] as never)?.id).toBe('c1')
  })
})
