// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/components/ui/v4/rn-stub'
import type { LogTranscriptLine } from '@/lib/execution-log-lines'
import type { CommandProgressStep } from '@/lib/instance-api'
import { LogViewer } from './log-viewer'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

vi.mock('react-native', async () => {
  const { reactNativeStub } = await import('@/components/ui/v4/rn-stub')
  return {
    ...reactNativeStub,
    // Every row rendered, no virtualization: enough to read what the list shows.
    FlatList: (props: Props) => {
      const data = props.data as readonly { key: string }[]
      const renderItem = props.renderItem as (info: { item: unknown; index: number }) => ReactNode
      return createElement(
        'div',
        { role: 'list', 'aria-label': props.accessibilityLabel as string },
        data.map((item, index) =>
          createElement('div', { key: item.key, 'data-key': item.key }, renderItem({ item, index }))
        )
      )
    },
    TextInput: (props: Props) =>
      createElement('input', {
        'aria-label': props.accessibilityLabel as string,
        value: props.value as string,
        onChange: (event: { target: { value: string } }) =>
          (props.onChangeText as (text: string) => void)(event.target.value),
      }),
  }
})
const clipboard = vi.hoisted(() => ({ setStringAsync: vi.fn(async () => true) }))
vi.mock('expo-clipboard', () => clipboard)
vi.mock('@/components/org/logs/log-transcript-view', () => ({
  downloadTranscript: vi.fn(),
  TranscriptPlaceholder: ({ state }: Readonly<{ state: string }>) =>
    createElement('p', null, state === 'waiting' ? 'Waiting for output…' : 'No transcript yet.'),
}))

afterEach(() => {
  cleanup()
  env.width = 1200
})

let seq = 0
function line(
  message: string,
  phase: string,
  stream: 'stdout' | 'stderr' = 'stdout'
): LogTranscriptLine {
  seq += 1
  return { seq, timestamp: null, stream, phase, message }
}

const LINES = [
  line('Deploy started', 'prepare'),
  line('Checked out 1a2b3c4', 'fetch'),
  line('Compiling 84 files', 'build'),
  line('Checking types', 'build'),
  line('Build failed: exited with code 1', 'build', 'stderr'),
]

const PLAN: CommandProgressStep[] = [
  { id: 'fetch', label: 'Fetch the code', state: 'done' },
  { id: 'build', label: 'Build', state: 'failed' },
  { id: 'start', label: 'Start the app', state: 'skipped' },
]

function renderViewer(overrides?: Partial<Parameters<typeof LogViewer>[0]>) {
  return render(
    createElement(LogViewer, {
      lines: LINES,
      state: 'sealed',
      plan: PLAN,
      commandStatus: 'failed',
      live: 'off',
      downloadFileName: 'deploy.log',
      ...overrides,
    })
  )
}

function shownText(): string {
  return screen.getByRole('list', { name: 'Log output' }).textContent ?? ''
}

describe('LogViewer', () => {
  it('opens only the failed step and keeps the others closed', () => {
    renderViewer()
    expect(shownText()).toContain('Build failed: exited with code 1')
    expect(shownText()).not.toContain('Checked out 1a2b3c4')
    expect(shownText()).toContain('Start the app')
  })

  it('search reaches into a closed step and Only matching hides context', async () => {
    renderViewer()
    act(() => {
      fireEvent.change(screen.getByLabelText('Search the log'), { target: { value: 'check' } })
    })
    // The search settles a moment after the last keystroke.
    expect(shownText()).not.toContain('Checked out 1a2b3c4')
    await waitFor(() => {
      expect(shownText()).toContain('Checked out 1a2b3c4')
    })
    expect(shownText()).toContain('Compiling 84 files')
    expect(screen.getByText('2 found')).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByText('Only matching lines'))
    })
    expect(shownText()).not.toContain('Compiling 84 files')
    expect(shownText()).toContain('Checking types')
  })

  it('opens and closes steps by their header', () => {
    renderViewer()
    act(() => {
      fireEvent.click(screen.getByText('Open all steps'))
    })
    expect(shownText()).toContain('Checked out 1a2b3c4')
    act(() => {
      fireEvent.click(screen.getByText('Close all steps'))
    })
    expect(shownText()).not.toContain('Build failed')
  })

  it('shows the Live switch only while live and reports a toggle', () => {
    const onLiveToggle = vi.fn()
    const { unmount } = renderViewer()
    expect(screen.queryByRole('switch', { name: 'Live' })).toBeNull()
    unmount()
    renderViewer({ live: 'on', onLiveToggle })
    act(() => {
      fireEvent.click(screen.getByRole('switch', { name: 'Live' }))
    })
    expect(onLiveToggle).toHaveBeenCalledTimes(1)
  })

  it('shows the waiting state before any output', () => {
    renderViewer({ lines: [], state: 'waiting' })
    expect(screen.getByText('Waiting for output…')).toBeTruthy()
  })

  it('an ungrouped log has no step controls', () => {
    renderViewer({ grouped: false, plan: null })
    expect(screen.queryByText('Open all steps')).toBeNull()
    expect(shownText()).toContain('Checked out 1a2b3c4')
  })
  it('copies what the view shows, with repeated progress ticks collapsed', async () => {
    const tick = (message: string): LogTranscriptLine => line(message, 'pull', 'stderr')
    renderViewer({
      lines: [tick('Image nginx Extracting'), tick('Image nginx Extracting')],
      plan: null,
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy the log' }))
    })
    expect(clipboard.setStringAsync).toHaveBeenCalledWith('Image nginx Extracting')
  })
})

describe('LogViewer on a phone', () => {
  it('puts Live, Jump to error, Filter and More in a bottom bar', () => {
    env.width = 390
    const onLiveToggle = vi.fn()
    renderViewer({ live: 'paused', onLiveToggle })
    expect(screen.queryByRole('switch', { name: 'Wrap' })).toBeNull()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Live, Paused' }))
    })
    expect(onLiveToggle).toHaveBeenCalledTimes(1)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    })
    expect(screen.getByRole('switch', { name: 'Errors and warnings' })).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'More' }))
    })
    expect(screen.getByRole('switch', { name: 'Wrap' })).toBeTruthy()
    expect(screen.queryByRole('switch', { name: 'Errors and warnings' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Jump to error' })).toBeTruthy()
  })

  it('leaves Live out of the bar once the deploy has finished', () => {
    env.width = 390
    renderViewer()
    expect(screen.queryByRole('button', { name: /^Live/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy()
  })
})
