// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectServerHeaderControl } from './project-server-pin'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const h = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  run: vi.fn(),
  setError: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
  View: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children }: Props) => <span>{children}</span>,
  Pressable: ({ children }: Props) => <button type="button">{children}</button>,
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => h.ctx,
}))
vi.mock('@/lib/queries', () => ({
  useOrgServers: () => ({
    data: { servers: [{ id: 's2', name: 'Server B', hostname: 'b.example.net', connected: true }] },
  }),
  useUpdateProject: () => ({ run: h.run, isPending: false }),
}))

const tracked = {
  id: 'p',
  options: {
    containerNaming: 'custom',
    composeSource: { mode: 'track', path: 'compose.yaml' },
  },
}

function pick(serverId: string) {
  fireEvent.change(screen.getByLabelText('Project-wide default server'), {
    target: { value: serverId },
  })
}

beforeEach(() => {
  h.run.mockReset().mockResolvedValue({ ok: true })
  h.setError.mockReset()
  h.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: tracked,
    canManage: true,
    projectAllowsMutations: true,
    setError: h.setError,
  }
})
afterEach(cleanup)

describe('ProjectServerHeaderControl while the project follows its repository', () => {
  it('sends the save instead of refusing it', async () => {
    render(<ProjectServerHeaderControl />)
    pick('s2')
    await waitFor(() => expect(h.run).toHaveBeenCalledTimes(1))
    expect(h.run).toHaveBeenCalledWith({
      options: {
        containerNaming: 'custom',
        defaultServerId: 's2',
        composeSource: tracked.options.composeSource,
      },
      target: 'base',
    })
    expect(h.setError).toHaveBeenCalledTimes(1)
    expect(h.setError).toHaveBeenCalledWith(null)
  })

  it('shows the control plane words and offers a reload when the Base changed since loading', async () => {
    const cause = new Error(
      '/projects/p failed: HTTP 409: base_tracks_repository — Reload and save again.'
    )
    h.run.mockResolvedValue({ ok: false, error: cause.message, cause })
    render(<ProjectServerHeaderControl />)
    pick('s2')
    await waitFor(() =>
      expect(h.setError).toHaveBeenLastCalledWith('Reload and save again.', { reload: true })
    )
  })

  it('offers no reload for another failure', async () => {
    h.run.mockResolvedValue({ ok: false, error: 'Server busy' })
    render(<ProjectServerHeaderControl />)
    pick('s2')
    await waitFor(() =>
      expect(h.setError).toHaveBeenLastCalledWith('Server busy', { reload: false })
    )
  })
})
