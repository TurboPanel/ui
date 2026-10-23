// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
const push = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, flatten: (s: unknown) => s },
  View: ({ children, role, id }: Props) => (
    <div id={id as string} role={role as string}>
      {children}
    </div>
  ),
  Text: ({ children }: Props) => <span>{children}</span>,
  ScrollView: ({ children }: Props) => <div data-testid="scroll">{children}</div>,
  Pressable: ({ children, onPress, role, accessibilityLabel }: Props) => (
    <div
      role={role as string}
      aria-label={accessibilityLabel as string}
      onClick={onPress as () => void}
    >
      {typeof children === 'function' ? (children as (s: object) => ReactNode)({}) : children}
    </div>
  ),
  TextInput: (props: Props) => (
    <input
      aria-label={props.accessibilityLabel as string}
      value={props.value as string}
      onChange={(e) => (props.onChangeText as (t: string) => void)(e.target.value)}
    />
  ),
}))
vi.mock('react-native-svg', () => ({
  default: () => null,
  Circle: () => null,
  Path: () => null,
  Rect: () => null,
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/v4/status-chip', () => ({ StatusChip: () => null }))
vi.mock('@/components/use-search-items', async () => {
  const { buildSearchItems } = await import('@/lib/search-index')
  const items = buildSearchItems('o1', {
    billingEnabled: false,
    projectsScopeId: 'all',
    canManage: true,
    canOwn: true,
    isPlatformAdmin: false,
    servers: [
      {
        id: 's2',
        name: 'zed',
        hostname: null,
        address: null,
        connected: false,
        statusChangedAt: 'x',
      },
    ],
    projects: [],
    databases: [],
    datacenters: [],
  })
  return { useSearchItems: () => items }
})

afterEach(() => {
  cleanup()
  push.mockReset()
})

async function mount() {
  const { SearchScreen } = await import('@/components/org/search-screen')
  render(<SearchScreen orgId="o1" />)
  return screen.getByLabelText('Search')
}

describe('SearchScreen', () => {
  it('lists actions and pages first and opens a tapped row', async () => {
    await mount()
    expect(screen.getByText('Jump to')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(push).toHaveBeenCalledWith('/o1/servers?add=1')
  })

  it('scrolls the whole result list instead of capping it', async () => {
    await mount()
    const scroll = screen.getByTestId('scroll')
    expect(scroll.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('shows the empty state', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText(/Nothing matches “zzz”/)).toBeTruthy()
  })

  it('asks before a dangerous action and opens only after Open', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'remove zed' } })
    fireEvent.click(screen.getAllByRole('option')[0]!)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Cancel'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    fireEvent.click(screen.getAllByRole('option')[0]!)
    fireEvent.click(screen.getByLabelText('Open'))
    expect(push).toHaveBeenCalledWith('/o1/servers/s2?tab=control')
  })

  it('clears a waiting question when the text changes', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'remove zed' } })
    fireEvent.click(screen.getAllByRole('option')[0]!)
    fireEvent.change(input, { target: { value: 'remove' } })
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
