// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { EnvironmentMap } from '@/components/org/project/environment-overview/environment-map'
import { mapInputOf } from '@/lib/v4/environment-overview'
import { overviewSource } from '@/lib/v4/environment-overview.fixtures'
import { mapLayout, type MapTarget } from '@/lib/v4/map-layout'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('expo-router', () => ({
  Link: ({ href, children }: Readonly<{ href: string; children: ReactNode }>) => <div data-href={href}>{children}</div>,
}))

afterEach(cleanup)

const layout = mapLayout(mapInputOf(overviewSource(), 'env'))
const hrefFor = (target: MapTarget) => (target.kind === 'volume' ? null : `/go/${target.kind}/${target.id}`)

describe.each(SCENARIOS)('EnvironmentMap ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('is one labelled group that says what the map holds', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const group = screen.getByRole('group', { name: layout.aria })
    expect(group).toBeTruthy()
    expect(layout.aria).toBe('Map of Staging: 1 domain, 3 apps, 5 data stores')
  })

  it('draws the three bands with their words', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    for (const label of ['Visitors', 'Apps', 'Data']) expect(screen.getByText(label)).toBeTruthy()
  })

  it('puts every station at the position the layout gives, as a link with its full description', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const web = layout.nodes.find((node) => node.name === 'web')!
    const link = screen.getByRole('link', { name: web.aria })
    expect(link.closest('[data-href]')?.getAttribute('data-href')).toBe('/go/service/web')
    expect(styleOf(link)).toMatchObject({ position: 'absolute', left: web.x, top: web.y, width: web.w, height: web.h })
    expect(web.aria).toContain('web, Node.js app, running, runs as website')
    expect(screen.getAllByRole('link')).toHaveLength(layout.nodes.filter((node) => node.kind !== 'volume').length)
  })

  it('shows what each station says: status, who it runs as, the change tag', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const web = screen.getByRole('link', { name: /^web, Node\.js app/ })
    expect(within(web).getByText('Running')).toBeTruthy()
    expect(within(web).getByText('as website')).toBeTruthy()
    expect(within(web).getByText('Staging change')).toBeTruthy()
    const domain = screen.getByRole('link', { name: /^shop\.example\.com, domain, secure/ })
    expect(within(domain).getByText('Secure')).toBeTruthy()
  })

  it('draws a station with nothing to open as plain text, not a link', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const uploads = layout.nodes.find((node) => node.name === 'uploads')!
    const station = screen.getByLabelText(uploads.aria)
    expect(station.closest('[data-href]')).toBeNull()
    expect(station.tagName).not.toBe('BUTTON')
  })

  it('paints the lines in the line colours of the theme', () => {
    const { container } = render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const colors = new Set(
      [...container.querySelectorAll('div[data-style]')]
        .map((el) => styleOf(el))
        .filter((style) => style.position === 'absolute' && typeof style.height === 'number' && style.backgroundColor)
        .map((style) => style.backgroundColor),
    )
    expect(colors.has(token(scenario, 'railHttps'))).toBe(true)
    expect(colors.has(token(scenario, 'railData'))).toBe(true)
    expect(container.querySelectorAll('path[d="M0 0 8 4 0 8Z"]').length).toBe(layout.heads.length)
  })

  it('paints a changed station on the blue tint and the others on the surface', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    const changed = styleOf(screen.getByRole('link', { name: /^web, Node\.js app/ }))
    const plain = styleOf(screen.getByRole('link', { name: /^blog, Website/ }))
    expect(changed.backgroundColor).toBe(token(scenario, 'baseSoft'))
    expect(plain.backgroundColor).toBe(token(scenario, 'surface'))
  })

  it('shows the legend it is given', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} legend={<span>legend here</span>} />)
    expect(screen.getByText('legend here')).toBeTruthy()
  })
})

describe.each(SCENARIOS)('EnvironmentMap, narrow ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    env.width = 500
  })

  it('stacks Visitors, Apps and Data with a link per station and its connections as words', () => {
    render(<EnvironmentMap layout={layout} hrefFor={hrefFor} />)
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Visitors', 'Apps', 'Data'])
    const web = screen.getByRole('link', { name: /^web, Node\.js app/ })
    expect(within(web).getByText('-> redis')).toBeTruthy()
    expect(within(web).getByText('<- shop.example.com')).toBeTruthy()
    expect(styleOf(web).position).not.toBe('absolute')
    expect(screen.queryByText('Set per environment')).toBeNull()
  })

  it('says when a lane is empty and draws a station without a page as text', () => {
    const empty = mapLayout({ ...mapInputOf(overviewSource({ hostings: {} }), 'env'), volumes: [] })
    render(<EnvironmentMap layout={empty} hrefFor={() => null} />)
    expect(screen.getByText('No domains yet')).toBeTruthy()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.getByLabelText(/^web, Node\.js app/)).toBeTruthy()
  })

  it('draws an app the environment removes dashed and faded', () => {
    const diff = mapLayout(mapInputOf(overviewSource(), 'diff'))
    render(<EnvironmentMap layout={diff} hrefFor={hrefFor} />)
    const old = styleOf(screen.getByRole('link', { name: /^old, Container/ }))
    expect(old.borderStyle).toBe('dashed')
    expect(old.opacity).toBe(0.5)
  })
})
