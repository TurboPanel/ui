// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { RunsAsChip } from '@/components/ui/v4/runs-as-chip'
import { resolveRunsAs } from '@/lib/v4/linux-users'
import type { RunsAs } from '@/lib/v4/linux-users'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

const website = (source: RunsAs['source'], sourceLabel: string): RunsAs => ({
  runsInContainer: false,
  user: 'website',
  label: 'Runs as website',
  short: 'as website',
  source,
  sourceLabel,
  access: 'SFTP on',
  hasAccess: true,
})

describe.each(SCENARIOS)('RunsAsChip ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('says who the app runs as, with the Linux user in code type', () => {
    render(<RunsAsChip runsAs={website('base', 'Base')} />)
    const chip = screen.getByLabelText('Runs as website, Base')
    expect(chip.textContent).toBe('Runs aswebsiteBase')
    expect(styleOf(chip).backgroundColor).toBe(token(scenario, 'surface3'))
    expect(styleOf(chip).minHeight).toBe(22)
    expect(styleOf(screen.getByText('website')).color).toBe(token(scenario, 'text'))
  })

  it('shows where a changed user comes from', () => {
    render(<RunsAsChip runsAs={website('env', 'Staging change')} />)
    expect(screen.getByLabelText('Staging change')).toBeTruthy()
    expect(screen.getByLabelText('Runs as website, Staging change')).toBeTruthy()
  })

  it('can hide the source', () => {
    render(<RunsAsChip runsAs={website('env', 'Staging change')} showSource={false} />)
    expect(screen.getByLabelText('Runs as website')).toBeTruthy()
    expect(screen.queryByLabelText('Staging change')).toBeNull()
  })

  it('draws a container dashed: it has no Linux user of its own', () => {
    const runsAs = resolveRunsAs({
      service: { id: 'cache', kind: 'container' },
      base: {},
      users: [],
      defaultUser: 'website',
    })
    render(<RunsAsChip runsAs={runsAs} />)
    const chip = screen.getByLabelText('Runs inside its container')
    expect(styleOf(chip).borderStyle).toBe('dashed')
    expect(styleOf(chip).backgroundColor).toBe('transparent')
    expect(screen.queryByText('Runs as')).toBeNull()
  })

  it('shows no tag when the source has no label', () => {
    render(<RunsAsChip runsAs={website('base', '')} />)
    expect(screen.getByLabelText('Runs as website')).toBeTruthy()
  })
})
