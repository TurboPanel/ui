// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HostingReleaseNotice,
  RemovedHostnameRelease,
} from '@/components/org/project/removed-hostname-release'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/components/ui', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}))

afterEach(cleanup)

describe('RemovedHostnameRelease', () => {
  it('releases the name when Release now is pressed', () => {
    const onRelease = vi.fn()
    render(<RemovedHostnameRelease busy={false} disabled={false} onRelease={onRelease} />)
    fireEvent.click(screen.getByText('Release now'))
    expect(onRelease).toHaveBeenCalledTimes(1)
  })

  it('does not release while disabled', () => {
    const onRelease = vi.fn()
    render(<RemovedHostnameRelease busy={false} disabled onRelease={onRelease} />)
    fireEvent.click(screen.getByText('Release now'))
    expect(onRelease).not.toHaveBeenCalled()
  })
})

describe('HostingReleaseNotice', () => {
  it('shows nothing without a notice', () => {
    render(<HostingReleaseNotice notice={null} />)
    expect(document.body.textContent).toBe('')
  })

  it('shows what the release said, a refusal as an alert', () => {
    render(<HostingReleaseNotice notice={{ tone: 'ok', message: 'example.test is released.' }} />)
    expect(screen.getByText('example.test is released.')).toBeTruthy()
    cleanup()
    render(<HostingReleaseNotice notice={{ tone: 'error', message: 'A deploy is running.' }} />)
    expect(screen.getByText('A deploy is running.')).toBeTruthy()
  })
})
