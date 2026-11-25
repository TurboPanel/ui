// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LOGIN_USER_ERROR,
  NO_RUNNING_CONTAINER,
  ServiceTerminalPanel,
  terminalContainer,
} from './service-terminal-panel'

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
    error,
  }: {
    label: string
    value: string
    onChangeText: (v: string) => void
    error?: string
  }) => (
    <div>
      <input aria-label={label} value={value} onChange={(e) => onChangeText(e.target.value)} />
      {error ? <p>{error}</p> : null}
    </div>
  ),
}))

const running = { id: 'c1', serverId: 's1', role: 'service', status: 'running', containerId: 'abc' }
const onServer = { id: 's1', trustPinnedBy: 'none', options: { terminal: { container: true } } }

beforeEach(() => {
  state.containers = [running]
  state.server = onServer
  state.can = { 'container:terminal:container': true, 'organization:organization:manage': false }
  state.push.mockReset()
})
afterEach(() => cleanup())

describe('Terminal entry on a service', () => {
  it('shows when the switch is on, the person may open one, even when the server is not pinned', () => {
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(screen.getByText('Open Terminal')).toBeTruthy()
    expect(screen.getByLabelText('Login User')).toBeTruthy()
  })

  it.each([
    ['the switch is off', () => (state.server = { ...onServer, options: {} })],
    ['the person has no permission', () => (state.can = {})],
    ['no container exists', () => (state.containers = [])],
    ['the server is not loaded', () => (state.server = undefined)],
  ])('hides when %s', (_name, change) => {
    change()
    const { container } = render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(container.textContent).toBe('')
  })

  it('says so when the switch is on but no service container is running', () => {
    state.containers = [{ ...running, status: 'exited' }]
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(screen.getByText('Terminal')).toBeTruthy()
    expect(screen.getByText(NO_RUNNING_CONTAINER)).toBeTruthy()
    expect(screen.queryByText('Open Terminal')).toBeNull()
  })

  it('anchors on a service container, never on a proxy row', () => {
    const proxy = { ...running, id: 'p1', serverId: 'edge', role: 'ingress', status: 'exited' }
    state.containers = [proxy]
    const only = render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(only.container.textContent).toBe('')
    cleanup()
    state.containers = [proxy, { ...running, status: 'exited' }]
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(screen.getByText(NO_RUNNING_CONTAINER)).toBeTruthy()
  })

  it('hides the not-running line when the switch is off or the person may not open one', () => {
    state.containers = [{ ...running, status: 'exited' }]
    state.server = { ...onServer, options: {} }
    const first = render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(first.container.textContent).toBe('')
    cleanup()
    state.server = onServer
    state.can = {}
    const second = render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    expect(second.container.textContent).toBe('')
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

  it('refuses a bad login user in the browser and opens once it is fixed', () => {
    render(<ServiceTerminalPanel orgId="o" serviceId="svc" />)
    fireEvent.change(screen.getByLabelText('Login User'), { target: { value: 'Not Valid' } })
    fireEvent.click(screen.getByText('Open Terminal'))
    expect(screen.getByText(LOGIN_USER_ERROR)).toBeTruthy()
    expect(screen.queryByText('fail open')).toBeNull()
    fireEvent.change(screen.getByLabelText('Login User'), { target: { value: 'www-data' } })
    expect(screen.queryByText(LOGIN_USER_ERROR)).toBeNull()
    fireEvent.click(screen.getByText('Open Terminal'))
    expect(screen.getByText('fail open')).toBeTruthy()
  })

  it('picks only a running service container with a Docker id', () => {
    expect(terminalContainer([{ ...running, containerId: ' ' }] as never)).toBeNull()
    expect(terminalContainer([{ ...running, role: 'ingress' }] as never)).toBeNull()
    expect(terminalContainer([running] as never)?.id).toBe('c1')
  })
})
