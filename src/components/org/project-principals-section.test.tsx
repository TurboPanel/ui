// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USERNAME_RESERVED_COPY } from '@/lib/principal-name-scheme'
import { ProjectPrincipalsSection } from './project-detail-section'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  run: vi.fn(),
  persist: vi.fn(),
  actionError: null as string | null,
  environments: [] as unknown[],
  principals: [] as unknown[],
  services: {} as Record<string, unknown[]>,
  assign: vi.fn(),
}))

vi.mock('react-native', async () => {
  const stub = (await import('@/components/ui/v4/rn-stub')).reactNativeStub
  return { ...stub, TextInput: stub.View }
})
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { error: {}, detailTitle: {}, muted: {} },
}))
vi.mock('@/components/ui', () => ({
  Badge: () => null,
  Button: (props: Props) => (
    <button
      type="button"
      aria-label={(props.accessibilityLabel as string) ?? (props.label as string)}
      disabled={Boolean(props.busy)}
      onClick={() => (props.onPress as (() => void) | undefined)?.()}
    >
      {props.label as string}
    </button>
  ),
  ConfirmButton: () => null,
  EmptyState: ({ title }: { title?: string }) => <div>{title}</div>,
  InlineNotice: ({ title }: Props) => <div>{title as string}</div>,
  LoadingState: () => null,
  SectionPanel: ({ children }: Props) => <div>{children}</div>,
  SettingRow: () => null,
  TextField: (props: Props) => (
    <label>
      {props.label as string}
      <input
        aria-label={props.label as string}
        value={props.value as string}
        disabled={props.editable === false}
        onChange={(event) => (props.onChangeText as (value: string) => void)(event.target.value)}
      />
    </label>
  ),
  Toggle: () => null,
}))
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/org/compose-base-panel', () => ({ ComposeBasePanel: () => null }))
vi.mock('@/components/org/managed/managed-project-section', () => ({
  ManagedProjectSection: () => null,
}))
vi.mock('@/components/org/project-variables-section', () => ({
  ProjectVariablesSection: () => null,
}))
vi.mock('@/components/org/project-environments-section', () => ({
  ProjectEnvironmentsSection: () => null,
}))
vi.mock('@/components/org/compose-persistence', () => ({
  usePersistProjectCompose: () => ({ run: vi.fn(), actionError: null }),
  usePersistAccountWrites: () => ({ run: state.persist, isPending: false, actionError: null }),
}))
vi.mock('@/components/org/principal-access-panel', () => ({ PrincipalAccessPanel: () => null }))
vi.mock('@/components/org/principal-name-scheme-field', () => ({
  PrincipalNameSchemeField: () => null,
  usePrincipalNameScheme: () => ({
    selected: 'partial',
    locked: false,
    orgScheme: 'partial',
    setChoice: vi.fn(),
    requestScheme: undefined,
    reset: vi.fn(),
  }),
}))
vi.mock('@/lib/queries/projects', () => ({
  useProjectPrincipals: () => ({
    isLoading: false,
    data: { principals: state.principals },
    error: null,
  }),
  useProject: () => ({ data: { project: { options: {} } } }),
  useCreateProjectPrincipal: () => ({
    run: state.run,
    isPending: false,
    get actionError() {
      return state.actionError
    },
  }),
  useDeleteProjectPrincipal: () => ({ run: vi.fn(), isPending: false, actionError: null }),
  useUpdateProjectPrincipalAssignments: () => ({
    run: state.assign,
    isPending: false,
    actionError: null,
  }),
  useUpdateProjectPrincipal: () => ({ run: vi.fn(), isPending: false, actionError: null }),
  useUpdateProject: () => ({ run: vi.fn(), isPending: false, actionError: null }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: () => ({
    isLoading: false,
    data: { environments: state.environments },
    error: null,
  }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServicesByEnvironments: () => ({ isLoading: false, servicesByEnv: state.services }),
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))

afterEach(cleanup)

describe('ProjectPrincipalsSection add Hosting Account', () => {
  beforeEach(() => {
    state.run.mockReset()
    state.persist.mockReset()
    state.actionError = null
    state.environments = []
    state.principals = []
    state.services = {}
    state.assign.mockReset()
  })

  it('declares the account where the waiting app lives instead of adding a loose row', async () => {
    state.persist.mockResolvedValue({ ok: true })
    state.environments = [
      {
        id: 'env-1',
        name: 'production',
        options: {
          compose: {
            version: 1,
            data: {
              services: {
                web: {
                  'x-turbopanel': {
                    serviceKind: 'node',
                    source: { sourceId: '11111111-1111-4111-8111-111111111111' },
                  },
                },
              },
            },
            presentation: { keyOrder: ['services'], comments: {} },
          },
        },
      },
    ]
    render(<ProjectPrincipalsSection orgId="org-1" projectId="proj-1" canManage />)
    expect(screen.getByText('An app is waiting for a Hosting Account')).toBeTruthy()
    // Left blank, the account is named after the project (no name here: "app").
    fireEvent.click(screen.getByRole('button', { name: 'Add Hosting Account' }))
    await waitFor(() => expect(state.persist).toHaveBeenCalledTimes(1))
    expect(state.run).not.toHaveBeenCalled()
    const writes = state.persist.mock.calls[0][0]
    expect(writes).toHaveLength(1)
    expect(writes[0].target).toEqual({ kind: 'environment', environmentId: 'env-1' })
    expect(JSON.stringify(writes[0].document)).toContain('"principal":"app"')
  })

  it('lists an account the file declares before the deploy creates it', () => {
    state.environments = [
      {
        id: 'env-1',
        name: 'production',
        options: {
          compose: {
            version: 1,
            data: {
              services: { site: { 'x-turbopanel': { serviceKind: 'site', principal: 'website' } } },
              'x-turbopanel': { principals: { website: {} } },
            },
            presentation: { keyOrder: ['services'], comments: {} },
          },
        },
      },
    ]
    render(<ProjectPrincipalsSection orgId="org-1" projectId="proj-1" canManage />)
    expect(screen.getByText('website')).toBeTruthy()
    expect(screen.queryByText('No Hosting Accounts yet.')).toBeNull()
  })

  it('shows plain words when the control plane refuses a reserved name', async () => {
    state.run.mockImplementation(async () => {
      state.actionError = 'HTTP 400: username_reserved'
      return { ok: false, error: 'HTTP 400: username_reserved' }
    })
    render(<ProjectPrincipalsSection orgId="org-1" projectId="proj-1" canManage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Add Hosting Account' }), {
      target: { value: 'ftp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Hosting Account' }))
    await waitFor(() => {
      expect(screen.getByText(USERNAME_RESERVED_COPY)).toBeTruthy()
    })
    expect(screen.queryByText(/username_reserved/)).toBeNull()
    expect(state.run).toHaveBeenCalledWith({ username: 'ftp', nameScheme: undefined })
  })

  describe('linking a Hosting Account to a service', () => {
    const row = (serviceIds: string[], metadata: unknown = null) => ({
      id: 'p-1',
      username: 'shop',
      appliedUsername: 'shop',
      serviceIds,
      metadata,
      access: {},
    })
    const web = { id: 'svc-1', composeServiceName: 'web', name: 'web' }
    const compose = (principal?: string) => ({
      version: 1,
      data: {
        services: { web: { 'x-turbopanel': principal ? { principal } : {} } },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    })
    const open = () => {
      render(<ProjectPrincipalsSection orgId="org-1" projectId="proj-1" canManage />)
      fireEvent.click(screen.getByRole('button', { name: 'Expand shop' }))
    }

    it('shows a Link button that sends the service id', async () => {
      state.assign.mockResolvedValue({ ok: true })
      state.environments = [{ id: 'env-1', name: 'production', options: { compose: compose() } }]
      state.services = { 'env-1': [web] }
      state.principals = [row([])]
      open()
      fireEvent.click(screen.getByRole('button', { name: /^Link shop to / }))
      await waitFor(() =>
        expect(state.assign).toHaveBeenCalledWith({ principalId: 'p-1', serviceIds: ['svc-1'] })
      )
    })

    it('shows Linked and an Unlink button when the row holds the service', () => {
      state.environments = [{ id: 'env-1', name: 'production', options: { compose: compose() } }]
      state.services = { 'env-1': [web] }
      state.principals = [row(['svc-1'])]
      open()
      expect(screen.getByText('Linked')).toBeTruthy()
      expect(screen.getByRole('button', { name: /^Unlink shop from / })).toBeTruthy()
    })

    it('shows Linked, with no Unlink, when the compose file names the account', () => {
      state.environments = [
        { id: 'env-1', name: 'production', options: { compose: compose('shop') } },
      ]
      state.services = { 'env-1': [web] }
      state.principals = [row([])]
      open()
      expect(screen.getByText('Linked')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^Link shop to / })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Unlink / })).toBeNull()
    })

    it('matches the compose alias of a row made from one', () => {
      state.environments = [
        { id: 'env-1', name: 'production', options: { compose: compose('site') } },
      ]
      state.services = { 'env-1': [web] }
      state.principals = [row([], { composeAlias: 'site' })]
      open()
      expect(screen.getByText('Linked')).toBeTruthy()
    })
  })
})
