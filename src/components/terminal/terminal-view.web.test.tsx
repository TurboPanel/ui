// @vitest-environment happy-dom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalView } from './terminal-view.web'

const mocks = vi.hoisted(() => ({
  phase: 'connecting' as string,
  close: vi.fn(),
  endTerminalSession: vi.fn(),
  openTerminalSession: vi.fn(),
  start: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {}, error: {} } }))
vi.mock('@/components/ui/button', () => ({ Button: () => null }))
vi.mock('@/lib/theme-preference', () => ({
  useColors: () => ({ bg: '#000', text: '#fff', accent: '#0f0', surface2: '#111' }),
}))
vi.mock('@/lib/version-prompt-gate', () => ({ useRegisterOpenDialog: () => undefined }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    loadAddon() {}
    open() {}
    dispose() {}
    focus() {}
    onData = () => ({ dispose() {} })
    onBinary = () => ({ dispose() {} })
    onResize = () => ({ dispose() {} })
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}))
vi.mock('@/lib/instance-api', () => ({
  openTerminalSession: mocks.openTerminalSession,
  endTerminalSession: mocks.endTerminalSession,
  terminalSocketUrl: (path: string) => `wss://cp.example.net${path}`,
}))
vi.mock('@/lib/terminal/session', () => ({
  TerminalSession: class {
    sid = 'sid-1'
    get state() {
      return { phase: mocks.phase }
    }
    start = mocks.start
    close = mocks.close
    write = () => true
    resize() {}
  },
}))

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  mocks.phase = 'connecting'
  mocks.close.mockReset()
  mocks.start.mockReset().mockReturnValue(new Promise(() => undefined))
  mocks.endTerminalSession.mockReset().mockResolvedValue({ ok: true, ended: true })
  mocks.openTerminalSession.mockReset().mockResolvedValue({ sid: 'sid-1', wsUrl: '/ws' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Terminal view leaving early', () => {
  it('ends the session when the view unmounts while it is still connecting', async () => {
    const view = render(<TerminalView serverId="s1" containerId="c1" onClose={() => undefined} />)
    await waitFor(() => expect(mocks.start).toHaveBeenCalled())
    view.unmount()
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.endTerminalSession).toHaveBeenCalledWith('s1', 'sid-1')
  })

  it('ends the grant when the view unmounts before the grant arrives', async () => {
    let grant: (value: unknown) => void = () => undefined
    mocks.openTerminalSession.mockReturnValue(new Promise((resolve) => (grant = resolve)))
    const view = render(<TerminalView serverId="s1" containerId="c1" onClose={() => undefined} />)
    await waitFor(() => expect(mocks.openTerminalSession).toHaveBeenCalled())
    view.unmount()
    grant({ sid: 'sid-2', wsUrl: '/ws' })
    await waitFor(() => expect(mocks.endTerminalSession).toHaveBeenCalledWith('s1', 'sid-2'))
  })

  it('leaves the end to the shell when it had already opened', async () => {
    mocks.phase = 'connected'
    const view = render(<TerminalView serverId="s1" containerId="c1" onClose={() => undefined} />)
    await waitFor(() => expect(mocks.start).toHaveBeenCalled())
    view.unmount()
    expect(mocks.close).toHaveBeenCalled()
    expect(mocks.endTerminalSession).not.toHaveBeenCalled()
  })
})
