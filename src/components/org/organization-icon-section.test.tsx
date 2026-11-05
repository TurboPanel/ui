// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationRecord } from '@/lib/instance-api'
import {
  ALLOW_EMOJI_ICONS_HELP,
  ALLOW_EMOJI_ICONS_LABEL,
  OrganizationIconSection,
} from './organization-icon-section'

const REFUSED =
  '/api/client/v1/organizations/o failed: HTTP 422: emoji_icons_off — This organization has emoji icons turned off. Pick one of the regular icons.'

const h = vi.hoisted(() => ({
  org: undefined as OrganizationRecord | undefined,
  canManage: true,
  run: vi.fn(),
  picker: null as null | {
    value: string | null
    isEmojiIconAllowed: boolean
    onSave: (icon: string | null) => Promise<string | null>
    onClose: () => void
  },
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  SectionPanel: (props: Readonly<{ title: string; children: unknown }>) => (
    <section aria-label={props.title}>{props.children as never}</section>
  ),
  SettingRow: (props: Readonly<{ label: string; description: string; children: unknown }>) => (
    <div>
      <span>{props.label}</span>
      <span>{props.description}</span>
      {props.children as never}
    </div>
  ),
  Toggle: (props: Readonly<Record<string, unknown>>) => (
    <button
      type="button"
      role="switch"
      aria-label={props.accessibilityLabel as string}
      aria-checked={props.value as boolean}
      disabled={Boolean(props.disabled)}
      onClick={() => (props.onValueChange as (next: boolean) => void)(!(props.value as boolean))}
    />
  ),
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: { error: {} } }))
vi.mock('@/components/org/icon-picker-sheet', () => ({
  IconButton: (props: Readonly<{ onPress: (() => void) | null; accessibilityLabel: string }>) =>
    props.onPress ? (
      <button type="button" aria-label={props.accessibilityLabel} onClick={props.onPress} />
    ) : (
      <span aria-label={props.accessibilityLabel} />
    ),
  IconPickerSheet: (props: NonNullable<typeof h.picker>) => {
    h.picker = props
    return <div data-testid="picker" />
  },
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => h.canManage }))
vi.mock('@/lib/queries/auth', () => ({
  useOrganizationRecord: () => h.org,
  useUpdateOrganization: () => ({ run: h.run, isPending: false }),
}))

function org(over: Partial<OrganizationRecord> = {}): OrganizationRecord {
  return { id: 'o', name: 'Acme', createdAt: 't', icon: null, isEmojiIconAllowed: true, ...over }
}

beforeEach(() => {
  h.org = org()
  h.canManage = true
  h.picker = null
  h.run.mockReset()
  h.run.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('OrganizationIconSection', () => {
  it('is hidden on a control plane that does not serve the icon fields', () => {
    h.org = { id: 'o', name: 'Acme', createdAt: 't' }
    const { container } = render(<OrganizationIconSection orgId="o" />)
    expect(container.innerHTML).toBe('')
  })

  it('is hidden while the organization is not known', () => {
    h.org = undefined
    const { container } = render(<OrganizationIconSection orgId="o" />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the icon and the Allow Emoji Icons switch with its explanation', () => {
    h.org = org({ icon: 'rocket' })
    render(<OrganizationIconSection orgId="o" />)
    expect(screen.getByText('Organization Icon')).toBeTruthy()
    expect(screen.getByText(/^Rocket\./)).toBeTruthy()
    expect(screen.getByText(ALLOW_EMOJI_ICONS_LABEL)).toBeTruthy()
    expect(screen.getByText(ALLOW_EMOJI_ICONS_HELP)).toBeTruthy()
    expect(
      screen.getByRole('switch', { name: 'Allow Emoji Icons' }).getAttribute('aria-checked')
    ).toBe('true')
  })

  it('saves the picked icon through the organization update', async () => {
    render(<OrganizationIconSection orgId="o" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change the organization icon' }))
    })
    expect(h.picker).toMatchObject({ value: null, isEmojiIconAllowed: true })
    let result: string | null = 'unset'
    await act(async () => {
      result = await h.picker!.onSave('🚀')
    })
    expect(h.run).toHaveBeenCalledWith({ organizationId: 'o', icon: '🚀' })
    expect(result).toBeNull()
    await act(async () => h.picker!.onClose())
    expect(screen.queryByTestId('picker')).toBeNull()
  })

  it('gives the picker the refusal in plain words', async () => {
    h.run.mockResolvedValue({ ok: false, error: REFUSED, cause: new Error(REFUSED) })
    render(<OrganizationIconSection orgId="o" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change the organization icon' }))
    })
    let result: string | null = null
    await act(async () => {
      result = await h.picker!.onSave('🚀')
    })
    expect(result).toBe(
      'This organization has emoji icons turned off. Pick one of the regular icons.'
    )
  })

  it('turns emoji icons off with one save, and shows a stored emoji as the default', async () => {
    h.org = org({ icon: '🚀' })
    render(<OrganizationIconSection orgId="o" />)
    expect(screen.getByText(/^🚀\./)).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Allow Emoji Icons' }))
    })
    expect(h.run).toHaveBeenCalledWith({ organizationId: 'o', isEmojiIconAllowed: false })
    h.org = org({ icon: '🚀', isEmojiIconAllowed: false })
    cleanup()
    render(<OrganizationIconSection orgId="o" />)
    expect(screen.getByText(/^Default\./)).toBeTruthy()
  })

  it('says why the switch did not save', async () => {
    h.run.mockResolvedValue({
      ok: false,
      error: 'HTTP 500',
      cause: new Error('/p failed: HTTP 500'),
    })
    render(<OrganizationIconSection orgId="o" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Allow Emoji Icons' }))
    })
    expect(screen.getByRole('alert').textContent).toBe('/p failed: HTTP 500')
    expect(
      screen.getByRole('switch', { name: 'Allow Emoji Icons' }).getAttribute('aria-checked')
    ).toBe('true')
  })

  it('is read-only for someone who cannot manage the organization', () => {
    h.canManage = false
    render(<OrganizationIconSection orgId="o" />)
    expect(screen.queryByRole('button', { name: 'Change the organization icon' })).toBeNull()
    expect(screen.getByLabelText('Organization icon')).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Allow Emoji Icons' }).hasAttribute('disabled')).toBe(
      true
    )
  })
})
