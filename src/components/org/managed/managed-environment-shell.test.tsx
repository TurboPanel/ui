// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagedEnvironmentHeader } from './managed-environment-shell'

const h = vi.hoisted(() => ({
  managed: {} as Record<string, unknown>,
  push: vi.fn(),
  apply: vi.fn(),
  lifecycle: vi.fn(),
  register: vi.fn(),
  status: 'ready' as string | null,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => ({
    orgId: 'o',
    projectId: 'p',
    selectedEnvironment: { id: 'e', name: 'production', isPrimary: true },
  }),
}))
vi.mock('@/components/org/project/environment-header-parts', () => ({
  EnvironmentTitle: ({ statusLabel }: Readonly<{ statusLabel: string }>) => (
    <h2 data-status={statusLabel}>production</h2>
  ),
  EnvironmentBadge: () => <span>Primary</span>,
  EnvironmentHeaderFrame: ({
    title,
    actions,
    facts,
  }: Readonly<{
    title: ReactNode
    actions: ReactNode
    facts: readonly { key: string; caption: string; value: string }[]
  }>) => (
    <header>
      {title}
      <div data-testid="actions">{actions}</div>
      <ul>
        {facts.map((fact) => (
          <li key={fact.key}>{`${fact.caption}: ${fact.value}`}</li>
        ))}
      </ul>
    </header>
  ),
}))
vi.mock('@/components/org/managed/managed-environment-context', () => ({
  useManagedEnvironment: () => h.managed,
  ManagedCommandsProvider: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
}))
vi.mock('@/lib/queries/managed', () => ({
  useManagedStatus: () => ({ data: h.status ? { status: h.status } : undefined }),
  useApplyEnvironmentManaged: () => ({ mutateAsync: h.apply }),
  useRunManagedLifecycle: () => ({ mutateAsync: h.lifecycle }),
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))

const PROVISIONED = {
  orgId: 'o',
  environmentId: 'e',
  provisioned: true,
  inFlight: false,
  registerCommand: h.register,
  applyCommand: null,
  detail: {
    managed: { engine: 'postgres', status: 'ready', serverId: 's1' },
    release: null,
    server: { id: 's1', name: 'web-1', hostname: null },
    externalAccess: { servers: [{ id: 's1', enabled: false }] },
  },
}

beforeEach(() => {
  h.managed = PROVISIONED
  h.status = 'ready'
  h.push.mockReset()
  h.register.mockReset()
  h.apply.mockReset().mockResolvedValue({ commandId: 'c1' })
  h.lifecycle.mockReset().mockResolvedValue({ commandId: 'c2' })
})
afterEach(cleanup)

const button = (name: string) => screen.getByRole('button', { name })

describe('ManagedEnvironmentHeader', () => {
  it('puts Connect where Visit sits and Apply changes where Deploy sits', () => {
    render(<ManagedEnvironmentHeader />)
    const labels = Array.from(
      screen.getByTestId('actions').querySelectorAll('[role="button"]')
    ).map((node) => node.getAttribute('aria-label'))
    expect(labels).toEqual(['Connect to this database', 'Restart', 'Apply changes'])
    expect(screen.getByText('Database: Running')).toBeTruthy()
    expect(screen.getByText('Server: web-1')).toBeTruthy()
    expect(screen.getByText('External access: Off')).toBeTruthy()
  })

  it('opens Bindings from Connect and queues Apply changes on the shared command list', async () => {
    render(<ManagedEnvironmentHeader />)
    fireEvent.click(button('Connect to this database'))
    expect(h.push).toHaveBeenCalledWith('/o/projects/p/environments/e/configuration/bindings')
    fireEvent.click(button('Apply changes'))
    await waitFor(() => expect(h.register).toHaveBeenCalledWith('c1', 'Apply'))
  })

  it('offers Start for a stopped database', async () => {
    h.status = 'stopped'
    render(<ManagedEnvironmentHeader />)
    fireEvent.click(button('Start'))
    await waitFor(() => expect(h.lifecycle).toHaveBeenCalledWith('start'))
  })

  it('keeps the slots but disables them before the database exists', () => {
    h.managed = { ...PROVISIONED, provisioned: false, detail: null }
    h.status = null
    render(<ManagedEnvironmentHeader />)
    expect(button('Connect to this database').getAttribute('aria-disabled')).toBe('true')
    expect(button('Apply changes').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Database: Not created yet')).toBeTruthy()
  })
})
