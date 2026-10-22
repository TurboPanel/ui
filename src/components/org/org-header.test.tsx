// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
const state = vi.hoisted(() => ({
  width: 1400,
  crumb: null as null | {
    trail: { label: string; href: string }[]
    current: { label: string; chip: null }
  },
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  View: ({ children }: Props) => <div>{children}</div>,
  useWindowDimensions: () => ({ width: state.width }),
}))
vi.mock('@/components/brand/turbopanel-logo', () => ({ TurboPanelLogo: () => <i>logo</i> }))
vi.mock('@/components/glass/glass-surface', () => ({
  GlassSurface: ({ children }: Props) => <header>{children}</header>,
}))
vi.mock('@/components/header-account-controls', () => ({
  HeaderAccountControls: () => <i>account</i>,
}))
vi.mock('@/components/header-menu-button', () => ({ HeaderMenuButton: () => <i>menu</i> }))
vi.mock('@/components/organization-switcher', () => ({
  OrganizationSwitcherSegment: () => <i>org-name</i>,
}))
vi.mock('@/components/header-search', () => ({
  HeaderSearch: ({ keepWidth }: Props) => <i>{`search keepWidth=${String(keepWidth)}`}</i>,
  HeaderSearchButton: () => <i>search-button</i>,
  useHeaderSearchShortcut: () => undefined,
}))
vi.mock('@/components/org/header-breadcrumb', () => ({
  HeaderBreadcrumb: ({ crumb }: { crumb: { current: { label: string } } }) => (
    <i>{`crumb ${crumb.current.label}`}</i>
  ),
}))
vi.mock('@/components/org/use-header-breadcrumb', () => ({
  useHeaderBreadcrumb: () => state.crumb,
}))
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ session: { email: 'a@b.c' }, signOut: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  state.width = 1400
  state.crumb = null
})

async function mount() {
  const { OrgHeader } = await import('@/components/org/org-header')
  render(<OrgHeader orgId="o1" />)
}

describe('OrgHeader breadcrumb', () => {
  it('shows nothing extra when the page has no breadcrumb', async () => {
    await mount()
    expect(screen.queryByText(/^crumb/)).toBeNull()
    expect(screen.getByText('search keepWidth=false')).toBeTruthy()
  })

  it('puts the breadcrumb beside the organization name and keeps the search a sensible width', async () => {
    state.crumb = { trail: [], current: { label: 'derp', chip: null } }
    await mount()
    const html = document.body.innerHTML
    expect(html.indexOf('org-name')).toBeLessThan(html.indexOf('crumb derp'))
    expect(html.indexOf('crumb derp')).toBeLessThan(html.indexOf('search keepWidth=true'))
    expect(screen.getByText('account')).toBeTruthy()
  })

  it('keeps phones unchanged', async () => {
    state.crumb = { trail: [], current: { label: 'derp', chip: null } }
    state.width = 500
    await mount()
    expect(screen.queryByText('crumb derp')).toBeNull()
  })

  it('still shows the breadcrumb on a narrow window where the search is an icon', async () => {
    state.crumb = { trail: [], current: { label: 'derp', chip: null } }
    state.width = 800
    await mount()
    expect(screen.getByText('crumb derp')).toBeTruthy()
    expect(screen.getByText('search-button')).toBeTruthy()
  })
})
