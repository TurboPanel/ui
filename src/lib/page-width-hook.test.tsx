// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { setPageWidth, togglePageWidth, usePageWidth } from './page-width'

describe('usePageWidth', () => {
  it('re-renders a component that reads the preference', () => {
    setPageWidth('contained')
    const { result } = renderHook(() => usePageWidth())
    expect(result.current).toBe('contained')
    act(() => {
      togglePageWidth()
    })
    expect(result.current).toBe('wide')
  })
})
