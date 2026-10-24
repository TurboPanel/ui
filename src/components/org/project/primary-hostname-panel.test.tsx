// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnvironmentRecord } from '@/lib/instance-api'
import { PrimaryHostnamePanel } from './primary-hostname-panel'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

const state = vi.hoisted(() => ({
  ctx: { orgId: 'o', canManage: true, projectAllowsMutations: true } as Record<string, unknown>,
  hostings: {} as Record<string, unknown[]>,
  run: vi.fn(() => Promise.resolve({ ok: true })),
  actionError: null as string | null,
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
  StyleSheet: { create: (styles: unknown) => styles },
  View: ({ children, accessibilityLabel }: Props) => (
    <div aria-label={accessibilityLabel as string | undefined}>{children}</div>
  ),
  Text: ({ children }: Props) => <span>{children}</span>,
}))
vi.mock('@/components/ui', () => ({
  SectionPanel: ({ title, children }: Props) => (
    <section aria-label={title as string}>{children}</section>
  ),
  Button: ({ label, accessibilityLabel, onPress, disabled }: Props) => (
    <button
      type="button"
      aria-label={accessibilityLabel as string}
      disabled={disabled as boolean}
      onClick={onPress as () => void}
    >
      {label as string}
    </button>
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { error: {} } }))
vi.mock('@/components/org/project/project-context', () => ({
  useProjectContext: () => state.ctx,
}))
vi.mock('@/lib/queries/environments', () => ({
  useUpdateEnvironment: () => ({ run: state.run, actionError: state.actionError }),
}))
vi.mock('@/lib/queries/services', () => ({
  useServices: () => ({ data: { services: [{ id: 's1' }] } }),
  useHostingsByServices: () => ({ hostingsByService: state.hostings }),
}))

const compose = { version: 1 } as unknown as NonNullable<EnvironmentRecord['options']>['compose']

function environment(options: EnvironmentRecord['options']): EnvironmentRecord {
  return { id: 'e1', name: 'production', options } as EnvironmentRecord
}

beforeEach(() => {
  state.ctx = { orgId: 'o', canManage: true, projectAllowsMutations: true }
  state.hostings = {
    s1: [
      { createdAt: '2026-10-01T00:00:00Z', options: { hostnames: ['shop.test', 'www.shop.test'] } },
    ],
  }
  state.run.mockClear()
  state.actionError = null
})
afterEach(cleanup)

describe('PrimaryHostnamePanel', () => {
  it('badges the primary hostname and offers Make primary on the others', () => {
    render(<PrimaryHostnamePanel environment={environment({ compose })} />)
    expect(screen.getByLabelText('shop.test').textContent).toContain('Primary hostname')
    expect(
      screen.getByRole('button', { name: 'Make www.shop.test the primary hostname' })
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make shop.test the primary hostname' })).toBeNull()
  })

  it('writes the new primary and keeps every other stored option', async () => {
    render(
      <PrimaryHostnamePanel environment={environment({ compose, primaryHostname: 'shop.test' })} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Make www.shop.test the primary hostname' }))
    await waitFor(() => expect(state.run).toHaveBeenCalledTimes(1))
    expect(state.run).toHaveBeenCalledWith({
      options: { compose, primaryHostname: 'www.shop.test' },
    })
  })

  it('shows the badge only, without Make primary, to someone who cannot change the project', () => {
    state.ctx = { orgId: 'o', canManage: false, projectAllowsMutations: true }
    render(<PrimaryHostnamePanel environment={environment(null)} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Primary hostname')).toBeTruthy()
  })

  it('says why a save failed', () => {
    state.actionError = 'Could not save'
    render(<PrimaryHostnamePanel environment={environment(null)} />)
    expect(screen.getByText('Could not save')).toBeTruthy()
  })

  it('renders nothing without a hostname', () => {
    state.hostings = {}
    const { container } = render(<PrimaryHostnamePanel environment={environment(null)} />)
    expect(container.textContent).toBe('')
  })
})
