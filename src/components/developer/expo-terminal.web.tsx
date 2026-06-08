import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import {
  EXPO_TERMINAL_SCROLLBACK,
  type ExpoTerminalHandle,
} from '@/components/developer/expo-terminal-types'
import { colors } from '@/lib/theme'

export type { ExpoTerminalHandle } from '@/components/developer/expo-terminal-types'
export { EXPO_TERMINAL_SCROLLBACK } from '@/components/developer/expo-terminal-types'

const LOG_FONT = '12px monospace'
const LOG_LINE_HEIGHT = 14.4

type ExpoTerminalProps = {
  onData: (data: string) => void
  onResize?: (cols: number, rows: number) => void
}

function measureGrid(container: HTMLElement): { cols: number; rows: number } {
  const probe = document.createElement('span')
  probe.textContent = 'W'.repeat(100)
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.font = LOG_FONT
  probe.style.whiteSpace = 'pre'
  container.appendChild(probe)
  const charWidth = probe.getBoundingClientRect().width / 100 || 7.2
  container.removeChild(probe)

  const cols = Math.max(2, Math.floor(container.clientWidth / charWidth))
  const rows = Math.max(1, Math.floor(container.clientHeight / LOG_LINE_HEIGHT))
  return { cols, rows }
}

export const ExpoTerminal = forwardRef<ExpoTerminalHandle, ExpoTerminalProps>(
  function ExpoTerminal({ onData: _onData, onResize }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const preRef = useRef<HTMLPreElement>(null)

    const onResizeRef = useRef(onResize)
    onResizeRef.current = onResize

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        const pre = preRef.current
        if (!pre) return
        pre.textContent = data
        pre.scrollTop = pre.scrollHeight
      },
      reset: () => {
        if (preRef.current) preRef.current.textContent = ''
      },
      focus: () => {
        preRef.current?.focus()
      },
      getSize: () => {
        const container = containerRef.current
        if (!container) return null
        return measureGrid(container)
      },
    }))

    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const notifySize = () => {
        const size = measureGrid(container)
        onResizeRef.current?.(size.cols, size.rows)
      }

      notifySize()

      const resizeObserver = new ResizeObserver(() => {
        notifySize()
      })
      resizeObserver.observe(container)

      return () => {
        resizeObserver.disconnect()
      }
    }, [])

    return (
      <div
        ref={containerRef}
        style={{
          height: 400,
          marginTop: 4,
          borderRadius: 8,
          overflow: 'hidden',
          border: `1px solid ${colors.borderArea}`,
          backgroundColor: colors.bgInset,
        }}
      >
        <pre
          ref={preRef}
          tabIndex={0}
          style={{
            margin: 0,
            padding: 8,
            height: '100%',
            overflow: 'auto',
            boxSizing: 'border-box',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: `${LOG_LINE_HEIGHT}px`,
            whiteSpace: 'pre',
            wordWrap: 'normal',
            color: colors.log,
            backgroundColor: colors.bgInset,
          }}
        />
      </div>
    )
  },
)
