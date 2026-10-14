// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode, Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode; ref?: Ref<never> }>

const push = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, flatten: (s: unknown) => s },
  View: ({ children, role, id, accessibilityRole, ref }: Props) => (
    <div ref={ref} id={id as string} role={(role ?? accessibilityRole) as string}>
      {children}
    </div>
  ),
  Text: ({ children, id }: Props) => <span id={id as string}>{children}</span>,
  Pressable: ({ children, onPress, role, id, accessibilityLabel, accessibilityRole, ...rest }: Props) => (
    <div
      id={id as string}
      role={(role ?? accessibilityRole) as string}
      aria-label={accessibilityLabel as string}
      aria-selected={rest['aria-selected'] as boolean}
      onClick={onPress as () => void}
    >
      {typeof children === 'function' ? (children as (s: object) => ReactNode)({}) : children}
    </div>
  ),
  TextInput: (props: Props) => (
    <input
      ref={props.ref}
      role={props.role as string}
      aria-label={props.accessibilityLabel as string}
      aria-activedescendant={props['aria-activedescendant'] as string}
      value={props.value as string}
      onChange={(e) => (props.onChangeText as (t: string) => void)(e.target.value)}
      onFocus={props.onFocus as () => void}
      onBlur={props.onBlur as () => void}
      onKeyDown={(e) =>
        (props.onKeyPress as (e: unknown) => void)({
          nativeEvent: { key: e.key },
          preventDefault: () => e.preventDefault(),
        })
      }
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
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ billingEnabled: false }) }))
vi.mock('@/lib/workspace-scope-context', () => ({ useOptionalWorkspaceScope: () => null }))

afterEach(() => {
  cleanup()
  push.mockReset()
})

async function mount(collapsed = false) {
  const { HeaderSearch } = await import('@/components/header-search')
  render(<HeaderSearch orgId="o1" collapsed={collapsed} />)
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  return input
}

describe('HeaderSearch', () => {
  it('lists the destinations under "Jump to" on focus', async () => {
    await mount()
    expect(screen.getByText('Jump to')).toBeTruthy()
    expect(screen.getAllByRole('option').length).toBeGreaterThan(5)
    expect(screen.queryByText('Billing')).toBeNull()
  })

  it('filters, retitles to Results and highlights the match', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'serv' } })
    expect(screen.getByText('Results')).toBeTruthy()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('Serv').tagName).toBe('SPAN')
  })

  it('shows the empty state', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches for “zzz”.')).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('moves with arrows and opens the selected route on Enter', async () => {
    const input = await mount()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/o1/projects/git-sources')
  })

  it('opens a clicked row and closes', async () => {
    await mount()
    fireEvent.click(screen.getByRole('option', { name: /Activity/ }))
    expect(push).toHaveBeenCalledWith('/o1/activity')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('closes on Escape', async () => {
    const input = await mount()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Jump to')).toBeNull()
  })
})
