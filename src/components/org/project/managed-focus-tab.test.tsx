// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagedFocusTab, RetiredManagedTabRedirect } from './managed-focus-tab'

const state = vi.hoisted(() => ({
  pathname: '/o/projects/p/environments/e',
  ctx: {} as Record<string, unknown>,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('expo-router', () => ({
  usePathname: () => state.pathname,
  Redirect: ({ href }: Readonly<{ href: string }>) => (
    <div data-testid="redirect" data-href={href} />
  ),
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/components/org/managed/managed-project-section', () => ({
  ManagedEnvironmentBody: ({
    focus,
    environmentId,
    notCreated,
  }: Readonly<{ focus: string; environmentId: string; notCreated: ReactNode }>) => (
    <div data-testid="body" data-focus={focus} data-environment={environmentId}>
      {notCreated}
    </div>
  ),
}))
vi.mock('@/components/org/managed/managed-tab-panels', () => ({
  ManagedByTurboPanelPanel: ({ body }: Readonly<{ body: string }>) => (
    <div data-testid="managed-by-turbopanel">{body}</div>
  ),
  ManagedEnvironmentLinksPanel: ({ tab }: Readonly<{ tab: string }>) => (
    <div data-testid="links" data-tab={tab} />
  ),
  ManagedNotCreatedPanel: () => <div data-testid="not-created" />,
}))
vi.mock('@/components/org/managed/managed-environment-delete', () => ({
  ManagedEnvironmentDelete: () => <div data-testid="delete" />,
}))
vi.mock('@/components/org/project-environments-section', () => ({
  ProjectEnvironmentsSection: () => <div data-testid="environments" />,
}))

const MANAGED = { id: 'p', kind: 'managed', name: 'app-db', metadata: { code: 'postgres' } }

function setContext(over: Record<string, unknown> = {}) {
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: MANAGED,
    pathEnvironmentId: 'e',
    environments: [{ id: 'e', name: 'production', isPrimary: true }],
    loading: false,
    ...over,
  }
}

beforeEach(() => {
  state.pathname = '/o/projects/p/environments/e'
  setContext()
})
afterEach(cleanup)

const focusAt = (pathname: string) => {
  state.pathname = pathname
  render(<ManagedFocusTab />)
  const focus = screen.getByTestId('body').getAttribute('data-focus')
  cleanup()
  return focus
}

describe('ManagedFocusTab', () => {
  it('draws the managed panels of each environment tab from the path', () => {
    const root = '/o/projects/p/environments/e'
    expect(focusAt(root)).toBe('overview')
    expect(focusAt(`${root}/deployments`)).toBe('deployments')
    expect(focusAt(`${root}/configuration`)).toBe('services')
    expect(focusAt(`${root}/configuration/storage`)).toBe('services')
    expect(focusAt(`${root}/configuration/bindings`)).toBe('bindings')
    expect(focusAt(`${root}/configuration/hosting`)).toBe('hosting')
    expect(focusAt(`${root}/settings`)).toBe('settings')
  })

  it('greys the Compose tab with the managed panel, never a dead link', () => {
    state.pathname = '/o/projects/p/environments/e/configuration/compose'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('managed-by-turbopanel')).toBeTruthy()
    expect(screen.queryByTestId('body')).toBeNull()
  })

  it('hands every tab the normal empty state for before the database exists', () => {
    state.pathname = '/o/projects/p/environments/e/configuration'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('not-created')).toBeTruthy()
  })

  it('puts delete at the end of Settings, and only there', () => {
    state.pathname = '/o/projects/p/environments/e/settings'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('delete')).toBeTruthy()
    cleanup()
    state.pathname = '/o/projects/p/environments/e/deployments'
    render(<ManagedFocusTab />)
    expect(screen.queryByTestId('delete')).toBeNull()
  })

  it('draws the project tabs: environments, greyed Base and Compose, per-environment links', () => {
    setContext({ pathEnvironmentId: null })
    state.pathname = '/o/projects/p/overview'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('environments')).toBeTruthy()
    cleanup()
    for (const path of ['/o/projects/p/base', '/o/projects/p/base/compose']) {
      state.pathname = path
      render(<ManagedFocusTab />)
      expect(screen.getByTestId('managed-by-turbopanel')).toBeTruthy()
      cleanup()
    }
    state.pathname = '/o/projects/p/base/bindings'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('links').getAttribute('data-tab')).toBe('bindings')
    cleanup()
    state.pathname = '/o/projects/p/base/hosting'
    render(<ManagedFocusTab />)
    expect(screen.getByTestId('links').getAttribute('data-tab')).toBe('hosting')
  })
})

describe('RetiredManagedTabRedirect', () => {
  const target = () => screen.getByTestId('redirect').getAttribute('data-href')

  it('keeps every old managed tab reachable in the primary environment', () => {
    for (const [tab, href] of [
      ['connect', '/o/projects/p/environments/e/configuration/bindings'],
      ['data', '/o/projects/p/environments/e/configuration'],
      ['backups', '/o/projects/p/environments/e/deployments'],
    ] as const) {
      render(<RetiredManagedTabRedirect tab={tab} />)
      expect(target()).toBe(href)
      cleanup()
    }
  })

  it('waits for the environments, then sends other projects to Environments', () => {
    setContext({ loading: true })
    const { container } = render(<RetiredManagedTabRedirect tab="connect" />)
    expect(container.innerHTML).toBe('')
    cleanup()
    setContext({ project: { id: 'p', kind: 'compose' } })
    render(<RetiredManagedTabRedirect tab="connect" />)
    expect(target()).toBe('/o/projects/p/overview')
  })
})
