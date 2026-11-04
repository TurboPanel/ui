// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS } from '@/components/ui/v4/rn-stub'
import { FirewallRulesetTable } from '@/components/org/firewall/firewall-ruleset-table'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)

const V4 = `*filter
:TP-INPUT - [0:0]
-A TP-INPUT -i lo -m comment --comment "tp:system:loopback" -j ACCEPT
-A TP-INPUT -p tcp --dport 22 -m comment --comment "tp:system:tcp-22" -j ACCEPT
-A TP-INPUT -s 10.0.0.0/8 -p tcp --dport 5432 -m comment --comment "tp:user:u:abc Postgres from office" -j ACCEPT
COMMIT
`
const V6 = `*filter
:TP-INPUT - [0:0]
-A TP-INPUT -i lo -m comment --comment "tp:system:loopback" -j ACCEPT
-A TP-INPUT -p ipv6-icmp -m comment --comment "tp:system:icmpv6" -j ACCEPT
COMMIT
`

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  applyScenario(SCENARIOS[0])
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})

function names(): string[] {
  return screen
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith('Show the rendered line.'))
}

describe('FirewallRulesetTable', () => {
  it('shows one row per line, merging lines identical in both families', () => {
    render(<FirewallRulesetTable rendered={{ v4: V4, v6: V6 }} />)
    expect(names()).toHaveLength(4)
    expect(screen.getByText('IPv4 + IPv6')).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Your Rules (1)' })).toBeTruthy()
  })

  it('narrows by search and by category, and clears both', () => {
    render(<FirewallRulesetTable rendered={{ v4: V4, v6: V6 }} />)
    fireEvent.change(screen.getByLabelText('Search the rendered ruleset'), {
      target: { value: '5432' },
    })
    expect(names()).toEqual(['Postgres from office, Allow. Show the rendered line.'])
    expect(screen.getByText(/Showing 1 of 4 rows/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Built In (3)' }))
    expect(names()).toHaveLength(3)

    fireEvent.click(screen.getByRole('tab', { name: 'IPv6' }))
    expect(names()).toHaveLength(2)
  })

  it('drops a stale IPv6 choice once the server stops sending an IPv6 ruleset', () => {
    const view = render(<FirewallRulesetTable rendered={{ v4: V4, v6: V6 }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'IPv6' }))
    expect(names()).toHaveLength(2)
    view.rerender(<FirewallRulesetTable rendered={{ v4: V4, v6: null }} />)
    expect(names()).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Clear Filters' })).toBeNull()
  })

  it('says so when nothing matches', () => {
    render(<FirewallRulesetTable rendered={{ v4: V4, v6: null }} />)
    expect(screen.queryByRole('tab', { name: 'IPv6' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Search the rendered ruleset'), {
      target: { value: 'nothing-like-this' },
    })
    expect(screen.getByText(/No lines match/)).toBeTruthy()
  })

  it('opens a row to show the exact rendered line', () => {
    render(<FirewallRulesetTable rendered={{ v4: V4, v6: null }} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Postgres from office, Allow. Show the rendered line.' })
    )
    expect(
      screen.getByText(
        '-A TP-INPUT -s 10.0.0.0/8 -p tcp --dport 5432 -m comment --comment "tp:user:u:abc Postgres from office" -j ACCEPT'
      )
    ).toBeTruthy()
  })
})
