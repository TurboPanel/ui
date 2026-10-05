// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import type { HomeProject } from '@/lib/v4/projects-home'
import { ProjectHomeCard } from './project-home-card'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)
vi.mock('@/components/org/platform-badge', () => ({
  PlatformBadge: () => <span data-testid="platform-badge" />,
}))

const PROJECT: HomeProject = {
  id: 'p1',
  name: 'Shop',
  kind: 'compose',
  description: 'The online shop',
  sub: '2 environments',
  baseLine: 'Base · 3 services · 2 Linux users',
  runs: [
    { runsInContainer: false, user: 'website', label: 'Runs as website', short: 'as website', source: 'base', sourceLabel: 'Base', access: 'SFTP on', hasAccess: true },
    { runsInContainer: true, user: '', label: 'Runs inside its container', short: 'Runs inside its container', source: 'image', sourceLabel: '', access: '', hasAccess: false },
  ],
  environments: [
    { id: 'e1', name: 'Production', status: 'running', relation: { standsAlone: false, changeCount: 0, text: 'Follows the Base', source: 'base' }, host: 'shop.example.com' },
    { id: 'e2', name: 'Staging', status: 'never', relation: { standsAlone: false, changeCount: 2, text: 'Follows the Base · 2 changes', source: 'env' }, host: null },
  ],
  status: 'never',
}

function renderCard(project: HomeProject = PROJECT, workspace?: string) {
  const handlers = { onOpen: vi.fn(), onOpenBase: vi.fn(), onOpenEnvironment: vi.fn() }
  render(<ProjectHomeCard project={project} workspace={workspace} {...handlers} />)
  return handlers
}

afterEach(cleanup)

describe.each(SCENARIOS)('project card on the Projects home ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('shows the name, kind line, description, Base line and who runs it', () => {
    renderCard(PROJECT, 'Acme')
    expect(screen.getByRole('heading', { name: 'Shop' })).toBeTruthy()
    expect(screen.getByText('2 environments · Acme')).toBeTruthy()
    expect(screen.getByText('The online shop')).toBeTruthy()
    expect(screen.getByText('Base · 3 services · 2 Linux users')).toBeTruthy()
    const who = screen.getByRole('group', { name: 'Who runs it' })
    expect(who.textContent).toContain('website')
    expect(who.textContent).toContain('Runs inside its container')
  })

  it('shows each environment with its status and its relation to the Base', () => {
    renderCard()
    const production = screen.getByRole('button', { name: 'Open Production in Shop' })
    expect(production.textContent).toContain('Running')
    expect(production.textContent).toContain('Follows the Base · shop.example.com')
    const staging = screen.getByRole('button', { name: 'Open Staging in Shop' })
    expect(staging.textContent).toContain('Not deployed yet')
    expect(staging.textContent).toContain('Follows the Base · 2 changes')
  })

  it('opens the project, its Base and an environment', () => {
    const handlers = renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Open Shop' }))
    fireEvent.click(screen.getByRole('link', { name: 'Shop: Base · 3 services · 2 Linux users' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open Staging in Shop' }))
    expect(handlers.onOpen).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenBase).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenEnvironment).toHaveBeenCalledWith('e2')
  })

  it('leaves out the Base line, the chips and the description when there are none', () => {
    renderCard({ ...PROJECT, description: null, baseLine: null, runs: [] })
    expect(screen.queryByText(/^Base ·/)).toBeNull()
    expect(screen.queryByRole('group', { name: 'Who runs it' })).toBeNull()
    expect(screen.queryByText('The online shop')).toBeNull()
  })

  it('a stand-alone environment shows no relation words it does not know', () => {
    renderCard({
      ...PROJECT,
      environments: [{ id: 'e1', name: 'Preview', status: 'unknown', relation: null, host: null }],
    })
    const row = screen.getByRole('button', { name: 'Open Preview in Shop' })
    expect(row.textContent).toContain('Unknown')
    expect(row.textContent).not.toContain('Follows')
  })

  it('a project with no environments shows only its header', () => {
    renderCard({ ...PROJECT, kind: 'setup', sub: 'Not set up yet', baseLine: null, runs: [], environments: [] })
    expect(screen.getByText('Not set up yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Open .* in Shop$/ })).toBeNull()
  })

  it('marks a platform project', () => {
    renderCard({ ...PROJECT, kind: 'platform' })
    expect(screen.getByTestId('platform-badge')).toBeTruthy()
  })

  it('draws the sheet behind an all-stand-alone project as empty', () => {
    renderCard({
      ...PROJECT,
      environments: [{ id: 'e1', name: 'Solo', status: 'running', relation: { standsAlone: true, changeCount: 0, text: 'Stands alone', source: 'own' }, host: null }],
    })
    expect(screen.getByRole('button', { name: 'Open Solo in Shop' }).textContent).toContain('Stands alone')
  })
})
