// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnvironmentServiceScreen, ProjectServiceRedirectScreen } from './service-detail-screen'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  params: {} as Record<string, string | string[]>,
  services: { isLoading: false, data: undefined as unknown },
  byEnv: { servicesByEnv: {} as Record<string, { id: string }[]>, isLoading: false },
  push: vi.fn(),
  navigate: vi.fn(),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children }: Props) => <div>{children}</div>,
  Text: ({ children }: Props) => <span>{children}</span>,
}))
vi.mock('expo-router', () => ({
  Redirect: ({ href }: Readonly<{ href: string }>) => (
    <div data-testid="redirect" data-href={href} />
  ),
  useLocalSearchParams: () => state.params,
  useRouter: () => ({ push: state.push, navigate: state.navigate }),
}))
vi.mock('@/components/ui', () => ({
  LoadingState: ({ label }: Readonly<{ label: string }>) => <span>{label}</span>,
  TextLink: ({
    label,
    onPress,
    accessibilityLabel,
  }: Readonly<{ label: string; onPress: () => void; accessibilityLabel?: string }>) => (
    <button type="button" aria-label={accessibilityLabel ?? label} onClick={onPress}>
      {label}
    </button>
  ),
}))
vi.mock('@/components/ui/v4/section', () => ({
  Section: ({ title, children }: Readonly<{ title: string; children: ReactNode }>) => (
    <section aria-label={title}>{children}</section>
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { muted: {} } }))
vi.mock('@/components/logs/service-runtime-log', () => ({
  ServiceRuntimeLogPanel: () => <div>runtime log</div>,
}))
vi.mock('@/components/org/node-settings-panel', () => ({
  NodeSettingsPanel: ({ environmentId }: Readonly<{ environmentId: string }>) => (
    <div>{`node settings in ${environmentId}`}</div>
  ),
}))
vi.mock('@/components/org/service-settings-panel', () => ({
  ServiceSettingsPanel: () => <div>service settings</div>,
}))
vi.mock('@/components/org/project/service-releases-panel', () => ({
  ServiceReleasesPanel: ({ environmentId }: Readonly<{ environmentId: string }>) => (
    <div>{`releases in ${environmentId}`}</div>
  ),
}))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries/services', () => ({
  useServices: () => state.services,
  useServicesByEnvironments: () => state.byEnv,
}))

const web = { id: 'svc-web', name: 'website', composeServiceName: 'web', environmentId: 'env-1' }

beforeEach(() => {
  state.ctx = {
    orgId: 'o',
    projectId: 'p',
    pathEnvironmentId: 'env-1',
    selectedEnvironment: { id: 'env-1', name: 'production' },
    selectedEnvironmentId: 'env-1',
    environments: [{ id: 'env-1' }, { id: 'env-2' }],
    canManage: true,
    isSystemProject: false,
    projectAllowsMutations: true,
    loading: false,
  }
  state.params = { serviceId: 'svc-web' }
  state.services = { isLoading: false, data: { services: [web] } }
  state.byEnv = { servicesByEnv: {}, isLoading: false }
  state.push.mockReset()
  state.navigate.mockReset()
})

afterEach(cleanup)

describe('EnvironmentServiceScreen', () => {
  it('opens the service inside its environment with a way back and a link to the Base', () => {
    render(<EnvironmentServiceScreen />)
    expect(screen.getByLabelText('website')).toBeTruthy()
    expect(screen.getByText('node settings in env-1')).toBeTruthy()
    expect(screen.getByText('releases in env-1')).toBeTruthy()
    expect(screen.getByText('Changes here apply to production only.')).toBeTruthy()

    fireEvent.click(screen.getByText('‹ production'))
    expect(state.navigate).toHaveBeenLastCalledWith(
      '/o/projects/p/environments/env-1/configuration'
    )
    expect(state.push).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Edit the Base'))
    expect(state.push).toHaveBeenLastCalledWith('/o/projects/p/base/services')
  })

  it('keeps the way back while loading and when the service is not in this environment', () => {
    state.services = { isLoading: true, data: undefined }
    render(<EnvironmentServiceScreen />)
    expect(screen.getByText('Loading service…')).toBeTruthy()
    expect(screen.getByText('‹ production')).toBeTruthy()
    cleanup()

    state.services = { isLoading: false, data: { services: [] } }
    render(<EnvironmentServiceScreen />)
    expect(screen.getByText('Service not found in production.')).toBeTruthy()
    expect(screen.getByText('‹ production')).toBeTruthy()
  })

  it('sends platform projects to the project overview', () => {
    state.ctx = { ...state.ctx, isSystemProject: true }
    render(<EnvironmentServiceScreen />)
    expect(screen.getByTestId('redirect').dataset.href).toBe('/o/projects/p/overview')
  })

  it('waits on a direct link while the path does not name the environment yet', () => {
    state.ctx = { ...state.ctx, pathEnvironmentId: null }
    const view = render(<EnvironmentServiceScreen />)
    expect(screen.queryByTestId('redirect')).toBeNull()

    state.ctx = { ...state.ctx, pathEnvironmentId: 'env-1' }
    view.rerender(<EnvironmentServiceScreen />)
    expect(screen.queryByTestId('redirect')).toBeNull()
    expect(screen.getByLabelText('website')).toBeTruthy()
  })
})

describe('ProjectServiceRedirectScreen', () => {
  it('redirects to the environment that runs the service, keeping the query', () => {
    state.params = { orgId: 'o', projectId: 'p', serviceId: 'svc-b', hostingId: 'h1' }
    state.byEnv = { servicesByEnv: { 'env-1': [], 'env-2': [{ id: 'svc-b' }] }, isLoading: false }
    render(<ProjectServiceRedirectScreen />)
    expect(screen.getByTestId('redirect').dataset.href).toBe(
      '/o/projects/p/environments/env-2/services/svc-b?hostingId=h1'
    )
  })

  it('waits while the lists load and says so when there is no environment', () => {
    state.byEnv = { servicesByEnv: {}, isLoading: true }
    render(<ProjectServiceRedirectScreen />)
    expect(screen.getByText('Loading service…')).toBeTruthy()
    cleanup()

    state.byEnv = { servicesByEnv: {}, isLoading: false }
    state.ctx = { ...state.ctx, selectedEnvironmentId: null, environments: [] }
    render(<ProjectServiceRedirectScreen />)
    expect(screen.getByText('Service not found.')).toBeTruthy()
  })

  it('sends platform projects to the project overview', () => {
    state.ctx = { ...state.ctx, isSystemProject: true }
    render(<ProjectServiceRedirectScreen />)
    expect(screen.getByTestId('redirect').dataset.href).toBe('/o/projects/p/overview')
  })
})
