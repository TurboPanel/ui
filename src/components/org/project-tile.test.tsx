// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf } from '@/components/ui/v4/rn-stub'
import type { HomeEnvironment, HomeProject } from '@/lib/v4/projects-home'
import { pillLabel, ProjectTile, tileSub } from './project-tile'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/org/platform-badge', () => ({
  PlatformBadge: () => <span>Platform</span>,
}))

function env(id: string, name: string, status: string, flags: Partial<HomeEnvironment> = {}) {
  return { id, name, status, isPrimary: false, pinned: false, ...flags }
}

function project(partial: Partial<HomeProject>): HomeProject {
  return {
    id: 'p1',
    name: 'Shop',
    kind: 'compose',
    workspaceId: 'w1',
    detail: null,
    environments: [],
    status: 'running',
    ...partial,
  }
}

afterEach(cleanup)

describe.each(SCENARIOS)('Project tile ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
  })

  it('shows the name, the workspace and the primary and pinned environments only', () => {
    const onOpen = vi.fn()
    render(
      <ProjectTile
        project={project({
          environments: [
            env('e1', 'Production', 'running', { isPrimary: true }),
            env('e2', 'Staging', 'failed', { pinned: true }),
            env('e3', 'Preview', 'stopped'),
            env('e4', 'Review', 'stopped'),
          ],
        })}
        workspace="Acme"
        layout="grid"
        onOpen={onOpen}
      />
    )
    const tile = screen.getByRole('button', { name: /^Open Shop/ })
    expect(tile.textContent).toBe('ShopAcmeProductionStaging+2')
    fireEvent.click(tile)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('speaks the whole tile in its own label, with each status word', () => {
    render(
      <ProjectTile
        project={project({
          environments: [
            env('e1', 'Production', 'running', { isPrimary: true }),
            env('e2', 'Staging', 'failed', { pinned: true }),
            env('e3', 'Preview', 'stopped'),
            env('e4', 'Review', 'stopped'),
          ],
        })}
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    expect(
      screen.getByRole('button', {
        name: 'Open Shop. Production (primary): Running. Staging (pinned): Deploy failed. 2 more environments',
      })
    ).toBeTruthy()
    expect(document.querySelectorAll('[aria-label]')).toHaveLength(1)
  })

  it('makes the primary pill bolder and marks pinned ones with a pin', () => {
    render(
      <ProjectTile
        project={project({
          environments: [
            env('e1', 'Production', 'running', { isPrimary: true }),
            env('e2', 'Staging', 'running', { pinned: true }),
          ],
        })}
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    const primary = screen.getByText('Production').parentElement as Element
    const pinned = screen.getByText('Staging').parentElement as Element
    expect(primary.querySelector('svg')).toBeNull()
    expect(pinned.querySelector('svg')).not.toBeNull()
    const weight = (el: Element) => styleOf(el.querySelector('span'))
    expect(weight(primary)).not.toEqual(weight(pinned))
  })

  it('folds the rest into a dashed plus-N pill named for screen readers', () => {
    render(
      <ProjectTile
        project={project({
          environments: [
            env('e1', 'Production', 'running', { isPrimary: true }),
            env('e2', 'A', 'x'),
          ],
        })}
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    const more = screen.getByText('+1').parentElement as Element
    expect(more.textContent).toBe('+1')
    expect(styleOf(more).borderStyle).toBe('dashed')
  })

  it('shows one quiet pill for a project that is not set up yet', () => {
    render(
      <ProjectTile
        project={project({ kind: 'setup', name: 'Blog', environments: [] })}
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    const pill = screen.getByText('Not set up yet').parentElement as Element
    expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Open Blog. Not set up yet')
    expect(styleOf(pill).borderStyle).toBe('dashed')
  })

  it('names a managed database in the sub line and a platform project by its badge', () => {
    const { unmount } = render(
      <ProjectTile
        project={project({
          kind: 'managed',
          detail: 'Managed database · PostgreSQL 18',
          name: 'Orders DB',
          environments: [env('e1', 'Production', 'running', { isPrimary: true })],
        })}
        workspace="Acme"
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Managed database · PostgreSQL 18 · Acme')).toBeTruthy()
    unmount()
    render(
      <ProjectTile
        project={project({ kind: 'platform', name: 'Infra' })}
        layout="grid"
        onOpen={vi.fn()}
      />
    )
    expect(screen.getByText('Platform')).toBeTruthy()
  })

  it('shows a chevron only on a wide list row', () => {
    const view = (layout: 'list' | 'listStacked') => (
      <ProjectTile project={project({})} layout={layout} onOpen={vi.fn()} />
    )
    const { unmount } = render(view('list'))
    expect(screen.getByText('›')).toBeTruthy()
    unmount()
    render(view('listStacked'))
    expect(screen.queryByText('›')).toBeNull()
  })
})

describe('tile words', () => {
  it('builds the sub line and the pill name', () => {
    expect(tileSub(null, 'Acme')).toBe('Acme')
    expect(tileSub(null, undefined)).toBe('')
    expect(tileSub('Compose', 'Acme')).toBe('Compose · Acme')
    expect(tileSub('Managed database', undefined)).toBe('Managed database')
    expect(pillLabel(env('e', 'Prod', 'busy', { isPrimary: true }))).toBe(
      'Prod (primary): Starting'
    )
  })
})
