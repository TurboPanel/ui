// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLASH_NOTICE_MS, postFlashNotice, resetFlashNoticesForTests } from '@/lib/flash-notice'
import { FlashNoticeHost } from './flash-notice-host'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', () => ({
  Button: (props: { label: string; onPress?: () => void }) => (
    <button type="button" onClick={props.onPress}>
      {props.label}
    </button>
  ),
}))

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  resetFlashNoticesForTests()
  vi.useRealTimers()
})

describe('FlashNoticeHost', () => {
  it('announces a notice politely as a status, without taking focus', () => {
    act(() => {
      postFlashNotice('Deleted organization Acme.')
    })
    render(<FlashNoticeHost />)
    const toast = screen.getByRole('status')
    expect(toast.getAttribute('aria-live')).toBe('polite')
    expect(toast.textContent).toContain('Deleted organization Acme.')
    expect(document.activeElement).toBe(document.body)
  })

  it('goes away on its own after the delay', () => {
    act(() => {
      postFlashNotice('Deleted organization Acme.')
    })
    render(<FlashNoticeHost />)
    act(() => vi.advanceTimersByTime(FLASH_NOTICE_MS + 1))
    expect(screen.queryByText('Deleted organization Acme.')).toBeNull()
  })

  it('pauses the countdown while hovered or focused, and restarts it afterwards', () => {
    act(() => {
      postFlashNotice('Deleted organization Acme.')
    })
    render(<FlashNoticeHost />)
    const toast = screen.getByRole('status')
    fireEvent.pointerEnter(toast)
    act(() => vi.advanceTimersByTime(FLASH_NOTICE_MS * 3))
    expect(screen.getByText('Deleted organization Acme.')).toBeTruthy()
    fireEvent.pointerLeave(toast)
    act(() => vi.advanceTimersByTime(FLASH_NOTICE_MS - 1))
    expect(screen.getByText('Deleted organization Acme.')).toBeTruthy()
    fireEvent.focus(toast)
    act(() => vi.advanceTimersByTime(FLASH_NOTICE_MS * 3))
    expect(screen.getByText('Deleted organization Acme.')).toBeTruthy()
    fireEvent.blur(toast)
    act(() => vi.advanceTimersByTime(FLASH_NOTICE_MS + 1))
    expect(screen.queryByText('Deleted organization Acme.')).toBeNull()
  })
})
