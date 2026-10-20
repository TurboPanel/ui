// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectIndexScreen from './index'

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
}))

vi.mock('react-native', () => ({
  Text: ({ children }: Readonly<{ children?: unknown }>) => <span>{children as string}</span>,
}))
vi.mock('expo-router', () => ({
  Redirect: ({ href }: Readonly<{ href: string }>) => (
    <div data-testid="redirect" data-href={href} />
  ),
  useLocalSearchParams: () => ({ orgId: 'o', projectId: 'p' }),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {} } }))
vi.mock('@/components/org/project/project-context', () => ({ useProjectContext: () => state.ctx }))

const composeProject = { id: 'p', type: 'docker-compose', metadata: { type: 'docker-compose' } }

beforeEach(() => {
  state.ctx = {
    loading: false,
    needsSetup: false,
    isSystemProject: false,
    project: composeProject,
    environments: [
      { id: 'e2', name: 'staging' },
      { id: 'e1', name: 'production', isPrimary: true },
    ],
  }
})
afterEach(cleanup)

const target = () => screen.getByTestId('redirect').getAttribute('data-href')

describe('project landing', () => {
  it('waits while the project loads', () => {
    state.ctx = { ...state.ctx, loading: true }
    render(<ProjectIndexScreen />)
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByTestId('redirect')).toBeNull()
  })

  it('opens the primary environment, not the Base', () => {
    render(<ProjectIndexScreen />)
    expect(target()).toBe('/o/projects/p/environments/e1')
  })

  it('opens the first listed environment when none is marked', () => {
    state.ctx = { ...state.ctx, environments: [{ id: 'e2', name: 'staging' }] }
    render(<ProjectIndexScreen />)
    expect(target()).toBe('/o/projects/p/environments/e2')
  })

  it('falls back to the Environments tab when the project has no environment yet', () => {
    state.ctx = { ...state.ctx, environments: [] }
    render(<ProjectIndexScreen />)
    expect(target()).toBe('/o/projects/p/overview')
  })

  it('keeps managed and platform projects on their own overview', () => {
    state.ctx = { ...state.ctx, project: { id: 'p', metadata: { type: 'managed' } } }
    render(<ProjectIndexScreen />)
    expect(target()).toBe('/o/projects/p/overview')
    cleanup()
    state.ctx = { ...state.ctx, project: composeProject, isSystemProject: true }
    render(<ProjectIndexScreen />)
    expect(target()).toBe('/o/projects/p/overview')
  })

  it('sends a project that still needs setup to setup', () => {
    state.ctx = { ...state.ctx, needsSetup: true }
    render(<ProjectIndexScreen />)
    expect(target()).toContain('/setup')
  })
})
