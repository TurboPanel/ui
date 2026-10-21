// @vitest-environment happy-dom
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OrganizationSwitcherSegment } from './organization-switcher'

type Props = { children?: ReactNode } & Record<string, unknown>

const state = vi.hoisted(() => ({
  orgs: [] as { id: string; name: string }[],
  billingEnabled: false,
  push: vi.fn(),
}))

vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('@/components/ui/v4/rn-stub')
  return {
    ...reactNativeStub,
    KeyboardAvoidingView: ({ children }: Props) => createElement('div', null, children),
    TextInput: (props: Props) =>
      createElement('input', {
        'aria-label': props.accessibilityLabel as string,
        placeholder: props.placeholder as string,
      }),
  }
})
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub,
)
vi.mock('expo-router', () => ({
  usePathname: () => '/org-1/projects',
  useRouter: () => ({ push: state.push, replace: vi.fn() }),
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ billingEnabled: state.billingEnabled }),
}))
vi.mock('@/lib/queries/auth', () => ({
  useOrganizationsQuery: () => ({ data: { organizations: state.orgs }, isLoading: false }),
  useCreateOrganization: () => ({ run: vi.fn() }),
}))
vi.mock('@/lib/org-context', () => ({ setActiveOrganizationId: vi.fn() }))
vi.mock('@/components/glass/glass-surface', () => ({
  GlassSurface: ({ children }: Props) => createElement('div', null, children),
}))
vi.mock('@/components/header-chevron', () => ({ HeaderChevron: () => null }))
vi.mock('@/components/create-organization-modal', () => ({
  CreateOrganizationModal: () => null,
}))
vi.mock('@/components/header-menu-overlay', () => ({
  HeaderMenuOverlay: ({ open, children }: Props) =>
    open ? createElement('div', { role: 'menu' }, children) : null,
}))
vi.mock('@/components/ui', () => ({
  EmptyState: ({ title }: { title: string }) => createElement('p', null, title),
}))

function makeOrgs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `org-${index + 1}`,
    name: `Org ${index + 1}`,
  }))
}

function openMenu(count: number) {
  state.orgs = makeOrgs(count)
  render(<OrganizationSwitcherSegment orgId="org-1" />)
  fireEvent.click(screen.getByLabelText('Organization: Org 1'))
}

beforeEach(() => {
  state.billingEnabled = false
  state.push.mockReset()
})
afterEach(cleanup)

describe('OrganizationSwitcherSegment menu', () => {
  it('hides the filter and View all for a short list', () => {
    openMenu(8)
    expect(screen.queryByLabelText('Filter organizations')).toBeNull()
    expect(screen.queryByLabelText('View all organizations')).toBeNull()
  })

  it('shows the filter and View all once the list is long', () => {
    openMenu(9)
    expect(screen.getByLabelText('Filter organizations')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('View all organizations'))
    expect(state.push).toHaveBeenCalledWith('/organizations')
  })

  it('marks the current organization quietly, with no Current tag', () => {
    openMenu(3)
    expect(screen.getByLabelText('Org 1, current organization')).toBeTruthy()
    expect(screen.getByLabelText('Switch to Org 2')).toBeTruthy()
    expect(screen.queryByText('Current')).toBeNull()
  })

  it('always offers a New organization action and Settings', () => {
    openMenu(2)
    expect(screen.getByText('New organization')).toBeTruthy()
    expect(screen.getByLabelText('Create organization')).toBeTruthy()
    expect(screen.getByLabelText('Organization settings')).toBeTruthy()
    expect(screen.queryByLabelText('Organization billing and licenses')).toBeNull()
  })

  it('shows Billing only when billing is enabled', () => {
    state.billingEnabled = true
    openMenu(2)
    expect(screen.getByLabelText('Organization billing and licenses')).toBeTruthy()
  })
})
