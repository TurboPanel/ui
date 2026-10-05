// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { cloneElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageTabs } from './page-tabs'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

// Plain DOM stand-ins for the React Native pieces the tab bar uses, so the
// test checks roles, names, selection and links without a native runtime.
vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: {
    create: (styles: unknown) => styles,
    flatten: (style: unknown) => style,
  },
  ScrollView: ({ children, accessibilityRole, accessibilityLabel }: Props) => (
    <div role={accessibilityRole as string} aria-label={accessibilityLabel as string}>
      {children}
    </div>
  ),
  Pressable: ({
    children,
    accessibilityRole,
    accessibilityLabel,
    accessibilityState,
    href,
  }: Props) => (
    <a
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      aria-selected={(accessibilityState as { selected?: boolean }).selected}
      href={href as string}
    >
      {children}
    </a>
  ),
  Text: ({ children }: Props) => <span>{children}</span>,
}))

vi.mock('expo-router', () => ({
  Link: ({ href, children }: Readonly<{ href: string; children: ReactElement }>) =>
    cloneElement(children as ReactElement<{ href: string }>, { href }),
}))

const TABS = [
  { id: 'overview', label: 'Overview', href: '/o/projects/p/environments/e' },
  { id: 'deployments', label: 'Deployments', href: '/o/projects/p/environments/e/deployments' },
  { id: 'settings', label: 'Settings', href: '/o/projects/p/environments/e/settings' },
] as const

afterEach(cleanup)

describe('PageTabs', () => {
  it('renders one named tab link per tab, in order, inside a labelled tab list', () => {
    render(<PageTabs tabs={TABS} activeId="overview" accessibilityLabel="Environment sections" />)
    expect(screen.getByRole('tablist', { name: 'Environment sections' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.getAttribute('aria-label'))).toEqual([
      'Overview',
      'Deployments',
      'Settings',
    ])
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual(TABS.map((tab) => tab.href))
  })

  it('marks only the active tab as selected', () => {
    render(<PageTabs tabs={TABS} activeId="deployments" accessibilityLabel="Sections" />)
    const selected = screen
      .getAllByRole('tab')
      .filter((tab) => tab.getAttribute('aria-selected') === 'true')
    expect(selected.map((tab) => tab.getAttribute('aria-label'))).toEqual(['Deployments'])
  })

  it('marks nothing as selected when the page is none of the tabs', () => {
    render(<PageTabs tabs={TABS} activeId={null} accessibilityLabel="Sections" />)
    expect(
      screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-selected') === 'false'),
    ).toBe(true)
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(
      <PageTabs tabs={[]} activeId={null} accessibilityLabel="Sections" />,
    )
    expect(container.innerHTML).toBe('')
  })
})
