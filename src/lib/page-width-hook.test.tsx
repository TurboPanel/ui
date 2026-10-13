// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setPageWidth, usePageWidth } from './page-width'

describe('usePageWidth', () => {
  it('re-renders a component that reads the preference', () => {
    setPageWidth('left')
    const { result } = renderHook(() => usePageWidth())
    expect(result.current).toBe('left')
    act(() => {
      setPageWidth('center')
    })
    expect(result.current).toBe('center')
  })
})
