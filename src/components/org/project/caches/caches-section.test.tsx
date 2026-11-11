// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { CacheRecord } from '@/lib/instance-api'
import { CachesSection } from './caches-section'

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  caches: undefined as { caches: unknown[] } | undefined,
  createRun: vi.fn(),
  updateRun: vi.fn(),
  deleteRun: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  TextField: (props: Readonly<Record<string, unknown>>) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.accessibilityLabel as string}
        value={props.value as string}
        onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
      />
    </label>
  ),
  MonoText: (props: Readonly<Record<string, unknown>>) => <code>{props.children as string}</code>,
  Checkbox: (props: Readonly<Record<string, unknown>>) => (
    <input
      type="checkbox"
      aria-label={props.accessibilityLabel as string}
      checked={props.checked as boolean}
      onChange={props.onPress as () => void}
    />
  ),
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries/caches', () => ({
  useEnvironmentCaches: () => ({ data: state.caches }),
  useCreateCache: () => ({ run: state.createRun, isPending: false }),
  useUpdateCache: () => ({ run: state.updateRun, isPending: false }),
  useDeleteCache: () => ({ run: state.deleteRun, isPending: false }),
}))
vi.mock('@/lib/queries/projects', () => ({
  useProjectPrincipals: () => ({
    data: {
      principals: [
        { id: 'p-blog', username: 'blog', serviceIds: ['s1'] },
        { id: 'p-other', username: 'other', serviceIds: ['elsewhere'] },
      ],
    },
  }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServices: () => ({ data: { services: [{ id: 's1' }] } }),
}))

const cache = (patch: Partial<CacheRecord> = {}): CacheRecord => ({
  id: 'c1',
  name: 'sessions',
  engine: 'valkey',
  version: '8.1',
  status: 'ready',
  access: 'socket',
  port: null,
  maxMemoryMb: 64,
  keyPrefix: 'REDIS',
  principalId: 'p-blog',
  hostingAccount: 'blog',
  serverId: 'srv',
  variables: ['REDIS_HOST', 'REDIS_PORT'],
  runtimeVersion: null,
  lastError: null,
  appliedAt: null,
  createdAt: '2026-11-11T00:00:00.000Z',
  ...patch,
})

function context(patch: Record<string, unknown> = {}) {
  return {
    orgId: 'o',
    projectId: 'p',
    selectedEnvironment: { id: 'e' },
    pathEnvironmentId: 'e',
    canManage: true,
    isSystemProject: false,
    projectAllowsMutations: true,
    ...patch,
  }
}

describe.each(SCENARIOS)('CachesSection ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    state.ctx = context()
    state.caches = { caches: [cache()] }
    state.createRun.mockReset()
    state.updateRun.mockReset()
    state.deleteRun.mockReset()
  })
  afterEach(cleanup)

  it('shows nothing until the list is read, or when it cannot be', () => {
    state.caches = undefined
    const { container } = render(<CachesSection />)
    expect(container.textContent).toBe('')
  })

  it('lists each cache with its status, access, memory and Hosting Account', () => {
    state.caches = {
      caches: [
        cache(),
        cache({ id: 'c2', name: 'queue', access: 'port', port: 18234, status: 'pending' }),
      ],
    }
    render(<CachesSection />)
    expect(screen.getByText('2 caches')).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
    expect(screen.getByText('Waiting for Deploy')).toBeTruthy()
    expect(screen.getByText('Private Socket')).toBeTruthy()
    expect(screen.getByText('Port 18234')).toBeTruthy()
    expect(screen.getAllByText('64 MiB · blog')).toHaveLength(2)
  })

  it('says there are no caches yet', () => {
    state.caches = { caches: [] }
    render(<CachesSection />)
    expect(screen.getByText('No caches yet')).toBeTruthy()
  })

  it('offers Add Cache only to a manager outside a system project', () => {
    render(<CachesSection />)
    expect(screen.getByRole('button', { name: 'Add Cache' })).toBeTruthy()
    cleanup()
    state.ctx = context({ canManage: false })
    render(<CachesSection />)
    expect(screen.queryByRole('button', { name: 'Add Cache' })).toBeNull()
    cleanup()
    state.ctx = context({ isSystemProject: true })
    render(<CachesSection />)
    expect(screen.queryByRole('button', { name: 'Add Cache' })).toBeNull()
  })

  it('opens the menu with Edit, Show Variables and Delete, and lists the variable names', () => {
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Edit',
      'Show Variables',
      'Delete',
    ])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show Variables' }))
    expect(screen.getByText('REDIS_HOST')).toBeTruthy()
    expect(screen.getByText('REDIS_PORT')).toBeTruthy()
  })

  it('gives a reader only the variables', () => {
    state.ctx = context({ canManage: false })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Show Variables',
    ])
  })

  it('adds a cache with the engine read-only and only this environment’s accounts', async () => {
    state.createRun.mockResolvedValue({ ok: true, value: { ok: true, cache: null, applied: true } })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }))
    expect(screen.getByText('Valkey 8.1')).toBeTruthy()
    expect(screen.queryByText('Preset')).toBeNull()
    expect(screen.queryByText('other')).toBeNull()
    fireEvent.change(screen.getByLabelText('Cache name'), { target: { value: 'sessions' } })
    fireEvent.change(screen.getByLabelText('Variable prefix'), { target: { value: 'SESS' } })
    expect(screen.getByLabelText('Variable names').textContent).toContain('SESS_SOCKET')
    const buttons = screen.getAllByRole('button', { name: 'Add Cache' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(state.createRun).toHaveBeenCalledTimes(1))
    expect(state.createRun).toHaveBeenCalledWith({
      name: 'sessions',
      principalId: 'p-blog',
      access: 'socket',
      maxMemoryMb: 64,
      keyPrefix: 'SESS',
    })
  })

  it('deletes with the data by default and keeps it when the box is cleared', async () => {
    state.deleteRun.mockResolvedValue({ ok: true, value: { ok: true, removed: 'host' } })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    const box = screen.getByLabelText<HTMLInputElement>('Also Delete the Cached Data')
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    fireEvent.click(screen.getByText('Delete Cache'))
    await waitFor(() => expect(state.deleteRun).toHaveBeenCalledTimes(1))
    expect(state.deleteRun).toHaveBeenCalledWith({ cacheId: 'c1', deleteData: false })
  })

  it('says when only the record was removed', async () => {
    state.deleteRun.mockResolvedValue({
      ok: true,
      value: { ok: true, removed: 'record_only' },
    })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByText('Delete Cache'))
    expect(await screen.findByText(/only the record was removed/)).toBeTruthy()
  })

  it('shows the control plane’s sentence when the delete is refused', async () => {
    state.deleteRun.mockResolvedValue({
      ok: false,
      error: 'x',
      cause: new Error(
        '/x failed: HTTP 503: cache_remove_not_queued \u2014 The host could not be asked; try again'
      ),
    })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByText('Delete Cache'))
    expect(await screen.findByText('The host could not be asked; try again')).toBeTruthy()
  })

  it('edits with the name and Hosting Account fixed, and sends only what changed', async () => {
    state.updateRun.mockResolvedValue({ ok: true, value: { ok: true, cache: null, applied: true } })
    render(<CachesSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions for cache sessions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.queryByLabelText('Cache name')).toBeNull()
    const save = screen.getByText('Save').closest('button')
    expect(save?.getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(screen.getByLabelText('Memory limit in MiB'), { target: { value: '128' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(state.updateRun).toHaveBeenCalledTimes(1))
    expect(state.updateRun).toHaveBeenCalledWith({ cacheId: 'c1', body: { maxMemoryMb: 128 } })
  })
})
