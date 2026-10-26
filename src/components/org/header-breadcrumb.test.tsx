// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>
const push = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  View: ({ children, role, ...rest }: Props) => (
    <div
      role={role as string}
      aria-label={rest['aria-label'] as string}
      aria-current={rest['aria-current'] as 'page'}
      title={rest.title as string}
    >
      {children}
    </div>
  ),
  Text: ({ children, ...rest }: Props) => (
    <span aria-hidden={rest['aria-hidden'] as boolean}>{children}</span>
  ),
  Pressable: ({ children, onPress, accessibilityRole, accessibilityLabel, ...rest }: Props) => (
    <button
      type="button"
      role={accessibilityRole as string}
      aria-label={accessibilityLabel as string}
      title={rest.title as string}
      onClick={onPress as () => void}
    >
      {children}
    </button>
  ),
}))
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/components/ui/v4/status-chip', () => ({
  StatusChip: ({ status, label }: Props) => (
    <span data-testid="chip">{(label as string) ?? (status as string)}</span>
  ),
}))

afterEach(() => {
  cleanup()
  push.mockReset()
})

async function mount(
  chip: { key: string; label?: string } | null = { key: 'online' },
  leading?: ReactNode
) {
  const { HeaderBreadcrumb } = await import('@/components/org/header-breadcrumb')
  render(
    <HeaderBreadcrumb
      crumb={{
        trail: [{ label: 'Servers', href: '/o1/servers' }],
        current: { label: 'derp', chip },
      }}
      leading={leading}
    />
  )
}

describe('HeaderBreadcrumb', () => {
  it('is a labelled navigation with the current page marked', async () => {
    await mount()
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeTruthy()
    const current = document.querySelector('[aria-current="page"]')
    expect(current?.textContent).toContain('derp')
    expect(current?.getAttribute('title')).toBe('derp')
  })

  it('links the trail, with a tooltip, and the separator is hidden from screen readers', async () => {
    await mount()
    const link = screen.getByRole('link', { name: 'Servers' })
    expect(link.getAttribute('title')).toBe('Servers')
    fireEvent.click(link)
    expect(push).toHaveBeenCalledWith('/o1/servers')
    expect(screen.getByText('›').getAttribute('aria-hidden')).toBe('true')
  })

  it('shows the status chip beside the current object', async () => {
    await mount({ key: 'busy', label: 'Initializing' })
    expect(screen.getByTestId('chip').textContent).toBe('Initializing')
  })

  it('shows no chip when the status is not known', async () => {
    await mount(null)
    expect(screen.queryByTestId('chip')).toBeNull()
  })

  it('puts the organization first, inside the same breadcrumb, with the same separator', async () => {
    await mount(null, <span>Acme</span>)
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const text = nav.textContent ?? ''
    expect(text).toBe('Acme›Servers›derp')
    expect(screen.getAllByText('›')).toHaveLength(2)
  })
})
