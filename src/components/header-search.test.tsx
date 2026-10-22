// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode, Ref } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode; ref?: Ref<never> }>

const push = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: {}, flatten: (s: unknown) => s },
  View: ({ children, role, id, accessibilityRole, ref, onMouseDown, ...rest }: Props) => (
    <div
      ref={ref}
      id={id as string}
      aria-label={rest['aria-label'] as string}
      role={(role ?? accessibilityRole) as string}
      onMouseDown={onMouseDown as () => void}
    >
      {children}
    </div>
  ),
  Text: ({ children, id, role }: Props) => (
    <span id={id as string} role={role as string}>
      {children}
    </span>
  ),
  Pressable: ({
    children,
    onPress,
    role,
    id,
    accessibilityLabel,
    accessibilityRole,
    onMouseDown,
    ...rest
  }: Props) => (
    <div
      id={id as string}
      onMouseDown={onMouseDown as () => void}
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
      aria-expanded={props['aria-expanded'] as boolean}
      aria-controls={props['aria-controls'] as string}
      value={props.value as string}
      onChange={(e) => (props.onChangeText as (t: string) => void)(e.target.value)}
      onFocus={props.onFocus as () => void}
      onBlur={props.onBlur as () => void}
      onKeyDown={(e) =>
        (props.onKeyPress as (e: unknown) => void)({
          nativeEvent: { key: e.key },
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
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
vi.mock('@/components/ui/v4/status-chip', () => ({
  StatusChip: ({ status, label }: Props) => (
    <span data-testid="chip">{(label as string) ?? (status as string)}</span>
  ),
}))
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
        id: 's1',
        name: 'derp',
        hostname: null,
        address: null,
        connected: true,
        statusChangedAt: 'x',
      },
      {
        id: 's2',
        name: 'zed',
        hostname: null,
        address: null,
        connected: false,
        statusChangedAt: 'x',
      },
    ],
    projects: [{ id: 'p1', name: 'Blog', type: null }],
    databases: [],
    datacenters: [],
  })
  return { useSearchItems: () => items }
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  push.mockReset()
})

async function mount(collapsed = false, onClose?: () => void) {
  const { HeaderSearch } = await import('@/components/header-search')
  render(<HeaderSearch orgId="o1" collapsed={collapsed} onClose={onClose} />)
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
    expect(screen.queryByText('derp')).toBeNull()
  })

  it('filters, retitles to Results and highlights the match', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'serv' } })
    expect(screen.getByText('Results')).toBeTruthy()
    expect(screen.getAllByRole('option').some((o) => o.textContent?.startsWith('Servers'))).toBe(
      true
    )
    expect(screen.getAllByText('Serv')[0]?.tagName).toBe('SPAN')
  })

  it('finds a server by name with its status chip, under a group heading', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'derp' } })
    const options = screen.getAllByRole('option')
    expect(options[0]?.textContent).toContain('derp')
    expect(options[0]?.textContent).toContain('online')
    expect(screen.getByText('Servers')).toBeTruthy()
    expect(screen.getByText('Actions')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/o1/servers/s1')
  })

  it('lists general actions first on an empty query and runs one on Enter', async () => {
    const input = await mount()
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('Add server')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/o1/servers?add=1')
  })

  it('shows the empty state', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText(/Nothing matches “zzz”/)).toBeTruthy()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('announces how many results there are', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'derp' } })
    expect(screen.getByRole('status').textContent).toMatch(/^\d+ results$/)
  })

  it('asks before a dangerous action opens, and Escape backs out of the question', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'remove zed' } })
    expect(screen.getAllByRole('option')[0]?.textContent).toContain('Asks first')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog').textContent).toContain('Remove server zed?')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    expect(push).not.toHaveBeenCalled()
  })

  it('opens the page only after the question is confirmed with Enter or the button', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'remove zed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/o1/servers/s2?tab=control')

    push.mockReset()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'reboot derp' } })
    fireEvent.click(screen.getAllByRole('option')[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(push).toHaveBeenCalledWith('/o1/servers/s1?tab=control')
  })

  it('cancels the question with the Cancel button', async () => {
    const input = await mount()
    fireEvent.change(input, { target: { value: 'remove zed' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  it('moves with arrows and opens the selected route on Enter', async () => {
    const input = await mount()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/o1/projects/new')
  })

  it('opens a clicked row and closes', async () => {
    await mount()
    fireEvent.click(
      screen.getAllByRole('option').find((o) => o.textContent?.startsWith('Activity'))!
    )
    expect(push).toHaveBeenCalledWith('/o1/activity')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('wraps with the arrows and tracks the active option', async () => {
    const input = await mount()
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const last = options.length - 1
    expect(input.getAttribute('aria-activedescendant')).toBe(options[last].id)
    expect(options[last].getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe(options[0].id)
  })

  it('only points aria-controls at a rendered listbox', async () => {
    const input = await mount()
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id)
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(input.getAttribute('aria-controls')).toBeNull()
    expect(document.getElementById('header-search-list')).toBeNull()
    fireEvent.blur(input)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })

  it('keeps focus in the field when pressing inside the popover, and closes on blur', async () => {
    const input = await mount()
    expect(fireEvent.mouseDown(screen.getByRole('listbox'))).toBe(false)
    expect(screen.getByRole('listbox')).toBeTruthy()
    fireEvent.blur(input)
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('keeps focus in the input when the field padding or icon is pressed', async () => {
    const input = await mount(true, vi.fn())
    const field = screen.getByRole('search').firstElementChild as HTMLElement
    expect(fireEvent.mouseDown(field)).toBe(false)
    expect(fireEvent.mouseDown(input)).toBe(true)
  })

  it('does not let Escape reach other handlers', async () => {
    const input = await mount()
    const seen = vi.fn()
    document.addEventListener('keydown', seen)
    fireEvent.keyDown(input, { key: 'Escape' })
    document.removeEventListener('keydown', seen)
    expect(seen).not.toHaveBeenCalled()
  })

  it('shows the shortcut badge while idle and the footer hints when open', async () => {
    const { HeaderSearch } = await import('@/components/header-search')
    render(<HeaderSearch orgId="o1" />)
    expect(screen.getByText(/⌘K|Ctrl K/)).toBeTruthy()
    fireEvent.focus(screen.getByRole('combobox'))
    expect(screen.getByText('to move')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Close search' })).toBeNull()
  })

  it('collapsed mode has a close button and no footer or badge', async () => {
    const onClose = vi.fn()
    await mount(true, onClose)
    expect(screen.queryByText('to move')).toBeNull()
    expect(screen.queryByText(/⌘K|Ctrl K/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const input = await mount()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByText('Jump to')).toBeNull()
  })
})

describe('useHeaderSearchShortcut', () => {
  async function mountHook(enabled = true) {
    const { useHeaderSearchShortcut } = await import('@/components/header-search')
    const onTrigger = vi.fn()
    function Probe() {
      const ref = useRef(null)
      useHeaderSearchShortcut(onTrigger, enabled)
      return (
        <div ref={ref}>
          <button type="button">b</button>
          <input aria-label="field" />
        </div>
      )
    }
    render(<Probe />)
    return onTrigger
  }

  it('fires on / and Cmd or Ctrl+K', async () => {
    const onTrigger = await mountHook()
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false)
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    fireEvent.keyDown(document.body, { key: 'K', ctrlKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(3)
  })

  it('skips / in a text field, on a button or while a dialog is open', async () => {
    const onTrigger = await mountHook()
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '/' })
    fireEvent.keyDown(screen.getByRole('button'), { key: '/' })
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(onTrigger).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', async () => {
    const onTrigger = await mountHook(false)
    fireEvent.keyDown(document.body, { key: '/' })
    expect(onTrigger).not.toHaveBeenCalled()
  })
})
