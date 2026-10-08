// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USERNAME_RESERVED_COPY } from '@/lib/principal-name-scheme'
import { ProjectPrincipalsSection } from './project-detail-section'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  run: vi.fn(),
  actionError: null as string | null,
}))

vi.mock('react-native', async () => {
  const stub = (await import('@/components/ui/v4/rn-stub')).reactNativeStub
  return { ...stub, TextInput: stub.View }
})
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
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
  InlineNotice: () => null,
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
    data: { principals: [] },
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
    run: vi.fn(),
    isPending: false,
    actionError: null,
  }),
  useUpdateProjectPrincipal: () => ({ run: vi.fn(), isPending: false, actionError: null }),
  useUpdateProject: () => ({ run: vi.fn(), isPending: false, actionError: null }),
}))
vi.mock('@/lib/queries/environments', () => ({
  useEnvironments: () => ({ isLoading: false, data: { environments: [] }, error: null }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServicesByEnvironments: () => ({ isLoading: false, servicesByEnv: {} }),
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))

afterEach(cleanup)

describe('ProjectPrincipalsSection add system user', () => {
  beforeEach(() => {
    state.run.mockReset()
    state.actionError = null
  })

  it('shows plain words when the control plane refuses a reserved name', async () => {
    state.run.mockImplementation(async () => {
      state.actionError = 'HTTP 400: username_reserved'
      return { ok: false, error: 'HTTP 400: username_reserved' }
    })
    render(
      <ProjectPrincipalsSection orgId="org-1" projectId="proj-1" canManage />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Add system user' }), {
      target: { value: 'ftp' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add system user' }))
    await waitFor(() => {
      expect(screen.getByText(USERNAME_RESERVED_COPY)).toBeTruthy()
    })
    expect(screen.queryByText(/username_reserved/)).toBeNull()
    expect(state.run).toHaveBeenCalledWith({ username: 'ftp', nameScheme: undefined })
  })
})
