// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeProject } from '@/lib/v4/projects-home'
import { useTileIconPicker } from './project-tile-icon-picker'

const REFUSED =
  '/api/client/v1/projects/p1 failed: HTTP 422: emoji_icons_off — This organization has emoji icons turned off. Pick one of the regular icons.'

const h = vi.hoisted(() => ({
  canManage: true,
  org: { isEmojiIconAllowed: true } as { isEmojiIconAllowed?: boolean } | undefined,
  run: vi.fn(),
  picker: null as null | {
    value: string | null
    isEmojiIconAllowed: boolean
    onSave: (icon: string | null) => Promise<string | null>
    onClose: () => void
  },
  api: null as null | ReturnType<typeof useTileIconPicker>,
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock('@/components/org/icon-picker-sheet', () => ({
  IconPickerSheet: (props: NonNullable<typeof h.picker>) => {
    h.picker = props
    return <div data-testid="picker" />
  },
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => h.canManage }))
vi.mock('@/lib/queries', () => ({ useUpdateProjectIcon: () => ({ run: h.run }) }))
vi.mock('@/lib/queries/auth', () => ({ useOrganizationRecord: () => h.org }))

function card(over: Partial<HomeProject> = {}): HomeProject {
  return {
    id: 'p1',
    name: 'Shop',
    kind: 'compose',
    icon: '🚀',
    workspaceId: 'w1',
    detail: null,
    environments: [],
    status: 'running',
    ...over,
  }
}

function keep(api: ReturnType<typeof useTileIconPicker>) {
  h.api = api
}

function Harness({ onApi = keep }: Readonly<{ onApi?: typeof keep }>) {
  const api = useTileIconPicker('o')
  onApi(api)
  return <>{api.sheet}</>
}

beforeEach(() => {
  h.canManage = true
  h.org = { isEmojiIconAllowed: true }
  h.picker = null
  h.run.mockReset()
  h.run.mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('useTileIconPicker', () => {
  it('opens the picker from a tile and saves through the project update', async () => {
    render(<Harness />)
    expect(h.api?.isEmojiIconAllowed).toBe(true)
    await act(async () => h.api?.changeIconFor(card())?.())
    expect(h.picker).toMatchObject({ value: '🚀', isEmojiIconAllowed: true })
    let result: string | null = 'unset'
    await act(async () => {
      result = await h.picker!.onSave('globe')
    })
    expect(h.run).toHaveBeenCalledWith({ projectId: 'p1', icon: 'globe' })
    expect(result).toBeNull()
    await act(async () => h.picker!.onClose())
    expect(screen.queryByTestId('picker')).toBeNull()
  })

  it('says in plain words why a save was refused', async () => {
    h.run.mockResolvedValue({ ok: false, error: REFUSED, cause: new Error(REFUSED) })
    render(<Harness />)
    await act(async () => h.api?.changeIconFor(card())?.())
    let result: string | null = null
    await act(async () => {
      result = await h.picker!.onSave('🐳')
    })
    expect(result).toBe(
      'This organization has emoji icons turned off. Pick one of the regular icons.'
    )
  })

  it('offers emoji only when the organization serves the fields and allows them', async () => {
    h.org = {}
    render(<Harness />)
    await act(async () => h.api?.changeIconFor(card())?.())
    expect(h.picker?.isEmojiIconAllowed).toBe(false)
  })

  it('gives no icon action to managed and platform tiles', () => {
    render(<Harness />)
    expect(h.api?.changeIconFor(card({ kind: 'managed' }))).toBeUndefined()
    expect(h.api?.changeIconFor(card({ kind: 'platform' }))).toBeUndefined()
    expect(h.api?.changeIconFor(card({ kind: 'setup' }))).toBeTypeOf('function')
  })

  it('gives no icon action without edit rights or before the organization is known', () => {
    h.canManage = false
    const { unmount } = render(<Harness />)
    expect(h.api?.changeIconFor(card())).toBeUndefined()
    unmount()
    h.canManage = true
    h.org = undefined
    render(<Harness />)
    expect(h.api?.changeIconFor(card())).toBeUndefined()
    expect(h.api?.isEmojiIconAllowed).toBe(true)
  })
})
