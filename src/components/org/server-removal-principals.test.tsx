// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrincipalRemovalPlanEntry } from '@/lib/instance-api'
import { deleteChoices, ServerRemovalPrincipals } from './server-removal-principals'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { detailTitle: {}, muted: {} },
}))
vi.mock('@/components/ui', () => ({
  InlineNotice: ({ title, body }: { title: string; body?: string }) => (
    <div>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  ),
  MonoText: ({ children }: { children?: unknown }) => <code>{children as never}</code>,
  Select: ({
    value,
    options,
    accessibilityLabel,
    onChange,
  }: {
    value: string
    options: { value: string; label: string }[]
    accessibilityLabel: string
    onChange: (value: string) => void
  }) => (
    <select
      aria-label={accessibilityLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}))

afterEach(cleanup)

function entry(patch: Partial<PrincipalRemovalPlanEntry>): PrincipalRemovalPlanEntry {
  return {
    placementId: 'pl-1',
    principalId: 'p-1',
    username: 'shop',
    appliedUsername: 'shop_abc',
    projectId: null,
    state: 'present',
    uid: 15001,
    gid: 15001,
    home: '/srv/users/shop_abc',
    source: 'manual',
    usedBy: {
      tenancies: 0,
      bindings: 0,
      storages: 0,
      secrets: 0,
      logins: 0,
      otherPlacements: 0,
    },
    defaultAction: 'keep',
    canDeleteOutright: true,
    ...patch,
  }
}

function renderList(
  plan: PrincipalRemovalPlanEntry[] | undefined,
  extra: { loading?: boolean; error?: unknown; onChange?: () => void } = {}
) {
  return render(
    <ServerRemovalPrincipals
      plan={plan}
      loading={extra.loading ?? false}
      error={extra.error ?? null}
      choices={{}}
      disabled={false}
      onChange={extra.onChange ?? vi.fn()}
    />
  )
}

describe('ServerRemovalPrincipals', () => {
  it('defaults every principal to keeping the identity', () => {
    renderList([entry({})])
    const select = screen.getByLabelText('What to do with shop_abc') as HTMLSelectElement
    expect(select.value).toBe('keep')
    expect(screen.getByText('Keep the principal, remove it from this server only')).toBeTruthy()
  })

  it('offers outright deletion only when nothing else uses the principal', () => {
    renderList([
      entry({}),
      entry({
        principalId: 'p-2',
        appliedUsername: 'busy_xyz',
        canDeleteOutright: false,
        usedBy: {
          tenancies: 2,
          bindings: 0,
          storages: 0,
          secrets: 0,
          logins: 0,
          otherPlacements: 1,
        },
      }),
    ])
    expect(screen.getAllByText('Delete the principal outright')).toHaveLength(1)
    expect(
      screen.getByText('Cannot be deleted while in use: 2 services run as it, 1 other server has it.')
    ).toBeTruthy()
  })

  it('reports a change of choice', () => {
    const onChange = vi.fn()
    renderList([entry({})], { onChange })
    fireEvent.change(screen.getByLabelText('What to do with shop_abc'), {
      target: { value: 'delete' },
    })
    expect(onChange).toHaveBeenCalledWith('p-1', 'delete')
  })

  it('says all are kept when the plan cannot be loaded, and renders nothing when empty', () => {
    const { unmount } = renderList(undefined, { error: new Error('boom') })
    expect(screen.getByText('Could not load the principals on this server')).toBeTruthy()
    unmount()
    const { container } = renderList([])
    expect(container.textContent).toBe('')
  })

  it('deleteChoices keeps only the outright deletions', () => {
    expect(deleteChoices({ a: 'keep', b: 'delete' })).toEqual([
      { principalId: 'b', action: 'delete' },
    ])
  })
})
