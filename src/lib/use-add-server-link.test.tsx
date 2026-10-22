// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAddServerLink } from '@/lib/use-add-server-link'

const state = vi.hoisted(() => ({ add: undefined as string | undefined }))
const setParams = vi.hoisted(() => vi.fn())
const router = vi.hoisted(() => ({ setParams }))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ add: state.add }),
  useRouter: () => router,
}))

beforeEach(() => {
  state.add = undefined
  setParams.mockReset()
})

describe('useAddServerLink', () => {
  it('does nothing without the query', () => {
    const open = vi.fn()
    renderHook(() => useAddServerLink(open))
    expect(open).not.toHaveBeenCalled()
    expect(setParams).not.toHaveBeenCalled()
  })

  it('opens on arrival and clears the query so a refresh does not reopen it', () => {
    state.add = '1'
    const open = vi.fn()
    renderHook(() => useAddServerLink(open))
    expect(open).toHaveBeenCalledTimes(1)
    expect(setParams).toHaveBeenCalledWith({ add: undefined })
  })

  it('opens again when the list is already showing and the query comes back', () => {
    const open = vi.fn()
    const { rerender } = renderHook(() => useAddServerLink(open))
    state.add = '1'
    rerender()
    expect(open).toHaveBeenCalledTimes(1)
    state.add = undefined
    rerender()
    state.add = '1'
    rerender()
    expect(open).toHaveBeenCalledTimes(2)
  })
})
