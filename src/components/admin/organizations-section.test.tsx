// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AdminOrganizationRow } from '@/lib/instance-api'
import { OrganizationsSection } from './organizations-section'

const { replace, setActive, rows } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActive: vi.fn(),
  rows: { current: [] as unknown[] },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-router', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
vi.mock('@/lib/org-context', () => ({
  getActiveOrganizationId: () => null,
  setActiveOrganizationId: setActive,
}))
vi.mock('@/lib/org-navigation', () => ({
  defaultOrgDashboardHref: (id: string) => `/${id}/projects`,
  replaceOrganization: (router: { replace: (href: string) => void }, href: string) =>
    router.replace(href),
}))
vi.mock('@/lib/queries/admin', () => ({
  useAdminOrganizations: () => ({
    data: { organizations: rows.current },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('@/components/org/organization-delete-button', () => ({
  OrganizationDeleteButton: ({
    orgName,
    disabled,
  }: Readonly<{ orgName: string; disabled?: boolean }>) => (
    <button type="button" disabled={disabled} aria-label={`Delete ${orgName}`}>
      Delete
    </button>
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Badge: ({ label }: Readonly<{ label: string }>) => <span>{label}</span>,
  Button: ({
    label,
    onPress,
    accessibilityLabel,
  }: Readonly<{ label: string; onPress: () => void; accessibilityLabel?: string }>) => (
    <button type="button" aria-label={accessibilityLabel} onClick={onPress}>
      {label}
    </button>
  ),
  DataTable: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
  DataTableRow: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
  DataTableCell: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
  DataTableEmpty: ({ children }: Readonly<{ children: unknown }>) => <div>{children as never}</div>,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function row(over: Partial<AdminOrganizationRow>): AdminOrganizationRow {
  return {
    id: 'o1',
    name: 'Acme',
    createdAt: '2026-03-01T00:00:00Z',
    owner: { id: 'u1', name: 'Ada', email: 'ada@example.net' },
    memberCount: 4,
    serverCount: 0,
    projectCount: 7,
    isRoot: false,
    ...over,
  }
}

describe('OrganizationsSection', () => {
  it('lists owner, counts and a Root badge', () => {
    rows.current = [row({}), row({ id: 'o2', name: 'Platform', isRoot: true, owner: null, projectCount: 9 })]
    render(<OrganizationsSection />)
    expect(screen.getByText('Acme')).toBeTruthy()
    expect(screen.getByText('Ada')).toBeTruthy()
    expect(screen.getByText('ada@example.net')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
    expect(screen.getAllByText('Root')).toHaveLength(1)
    expect(screen.getByText('No owner')).toBeTruthy()
  })

  it('disables Delete for the root and explains servers', () => {
    rows.current = [
      row({ id: 'o2', name: 'Platform', isRoot: true }),
      row({ id: 'o3', name: 'Busy', serverCount: 2 }),
      row({ id: 'o4', name: 'Empty' }),
    ]
    render(<OrganizationsSection />)
    expect((screen.getByLabelText('Delete Platform') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Delete Busy') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Remove its 2 servers first.')).toBeTruthy()
    expect((screen.getByLabelText('Delete Empty') as HTMLButtonElement).disabled).toBe(false)
  })

  it('Open switches into the organization', () => {
    rows.current = [row({})]
    render(<OrganizationsSection />)
    fireEvent.click(screen.getByLabelText('Open Acme'))
    expect(setActive).toHaveBeenCalledWith('o1')
    expect(replace).toHaveBeenCalledWith('/o1/projects')
  })
})
