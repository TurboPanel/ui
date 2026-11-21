// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  dismissFlashNotice,
  postFlashNotice,
  resetFlashNoticesForTests,
  useFlashNotices,
} from './flash-notice'

afterEach(() => {
  cleanup()
  resetFlashNoticesForTests()
})

describe('flash notices', () => {
  it('queues notices in order and removes one by id', () => {
    const { result } = renderHook(() => useFlashNotices())
    let first = 0
    act(() => {
      first = postFlashNotice('One.')
      postFlashNotice('Two.')
    })
    expect(result.current.map((n) => n.text)).toEqual(['One.', 'Two.'])
    act(() => dismissFlashNotice(first))
    expect(result.current.map((n) => n.text)).toEqual(['Two.'])
  })

  it('ignores a dismiss for a notice that is already gone', () => {
    const { result } = renderHook(() => useFlashNotices())
    act(() => dismissFlashNotice(9999))
    expect(result.current).toEqual([])
  })

  it('keeps notices posted before anything is watching', () => {
    postFlashNotice('Early.')
    const { result } = renderHook(() => useFlashNotices())
    expect(result.current.map((n) => n.text)).toEqual(['Early.'])
  })
})
