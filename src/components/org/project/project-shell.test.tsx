// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectShell } from './project-shell'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  pathname: '/o/projects/p/base',
  push: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles, flatten: (style: unknown) => style },
  View: ({ children }: Props) => <div>{children}</div>,
  ScrollView: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children }: Props) => <span>{children}</span>,
  TextInput: () => <input />,
  Pressable: ({ children, onPress }: Props) => (
    <button type="button" onClick={onPress as () => void}>
      {children}
    </button>
  ),
}))

vi.mock('expo-router', () => ({
  Link: ({ children }: Readonly<{ children: ReactNode }>) => <>{children}</>,
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}))

vi.mock('@/components/header-chevron', () => ({ BreadcrumbChevron: () => null }))
vi.mock('@/components/org/platform-badge', () => ({ PlatformBadge: () => null }))
vi.mock('@/components/org/project-delete-panel', () => ({ ProjectDeletePanel: () => null }))
vi.mock('@/components/org/project/project-title-icon', () => ({ ProjectTitleIcon: () => null }))
vi.mock('@/components/org/project/trash-icon', () => ({ TrashIcon: () => null }))
vi.mock('@/components/org/project/project-section-tabs', () => ({
  ProjectSectionTabs: () => null,
  activeProjectTabFromPathname: () => null,
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries', () => ({
  commandStatusById: () => ({}),
  isTerminalCommandStatus: () => false,
  useCommandsBatch: () => ({ data: undefined }),
  useDeleteEnvironment: () => ({}),
  useDeleteEnvironmentManagedMutation: () => ({}),
  useUpdateProject: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/components/ui/v4', () => ({
  UnderlineTabs: ({
    tabs,
    value,
    onChange,
  }: Readonly<{
    tabs: readonly { key: string; label: string }[]
    value: string
    onChange: (key: string) => void
  }>) => (
    <div role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  ),
}))

function setContext(overrides: Record<string, unknown> = {}) {
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    project: { id: 'p', kind: 'compose', name: 'Shop', metadata: null },
    loading: false,
    error: null,
    needsSetup: false,
    isWorkspaceKindResolved: true,
    isSystemProject: false,
    projectAllowsMutations: false,
    canManage: false,
    environments: [],
    draft: null,
    ...overrides,
  }
}

const tabLabels = () => screen.getAllByRole('tab').map((tab) => tab.textContent)
const selected = () =>
  screen
    .getAllByRole('tab')
    .filter((tab) => tab.getAttribute('aria-selected') === 'true')
    .map((tab) => tab.textContent)

beforeEach(() => {
  state.pathname = '/o/projects/p/base'
  state.push.mockReset()
  setContext()
})
afterEach(cleanup)

describe('project tab bar', () => {
  it('shows one bar with Compose, Bindings and Hosting, lighting the one in view', () => {
    for (const [pathname, active] of [
      ['/o/projects/p/overview', 'Environments'],
      ['/o/projects/p/base', 'Base'],
      ['/o/projects/p/base/services', 'Compose'],
      ['/o/projects/p/base/storage', 'Base'],
      ['/o/projects/p/base/compose', 'Compose'],
      ['/o/projects/p/base/bindings', 'Bindings'],
      ['/o/projects/p/base/hosting', 'Hosting'],
      ['/o/projects/p/settings', 'Settings'],
    ] as const) {
      state.pathname = pathname
      render(<ProjectShell>body</ProjectShell>)
      expect(tabLabels()).toEqual([
        'Environments',
        'Base',
        'Compose',
        'Bindings',
        'Hosting',
        'Settings',
      ])
      expect(selected()).toEqual([active])
      cleanup()
    }
  })

  it('opens the Base sections under /base', () => {
    render(<ProjectShell>body</ProjectShell>)
    fireEvent.click(screen.getByRole('tab', { name: 'Bindings' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/base/bindings')
    fireEvent.click(screen.getByRole('tab', { name: 'Compose' }))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/base/compose')
  })
})

describe('create-wizard draft tabs', () => {
  it('keeps the Overview, Compose and Services lenses and switches the draft section', () => {
    const setSection = vi.fn()
    setContext({ projectId: 'draft', draft: { section: 'compose', setSection } })
    state.pathname = '/o/projects/new'
    render(<ProjectShell>body</ProjectShell>)
    expect(tabLabels()).toEqual(['Overview', 'Compose', 'Services'])
    expect(selected()).toEqual(['Compose'])
    fireEvent.click(screen.getByRole('tab', { name: 'Services' }))
    expect(setSection).toHaveBeenCalledWith('services')
    expect(state.push).not.toHaveBeenCalled()
  })

  it('shows no tabs for a draft with a single lens', () => {
    setContext({
      projectId: 'draft',
      draft: { section: 'overview', setSection: vi.fn(), sections: ['overview'] },
    })
    state.pathname = '/o/projects/new'
    render(<ProjectShell>body</ProjectShell>)
    expect(screen.queryByRole('tablist')).toBeNull()
  })
})
