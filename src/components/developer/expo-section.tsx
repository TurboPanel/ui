import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { SectionPanel } from '@/components/developer/section-panel'
import { developerStyles } from '@/components/developer/developer-styles'
import { ExpoTerminal, type ExpoTerminalHandle } from '@/components/developer/expo-terminal'
import { useDeveloper } from '@/lib/developer-context'
import { DEVELOPER_SECTIONS } from '@/lib/developer-navigation'
import {
  EXPO_PTY_WS_PATH,
  fetchExpoStatus,
  restartExpoService,
} from '@/lib/instance-api'
import { colors } from '@/lib/theme'

const section = DEVELOPER_SECTIONS.find((s) => s.id === 'expo')!
const RECONNECT_DELAY_MS = 3000

export function ExpoSection() {
  const { healthOk } = useDeveloper()
  const [running, setRunning] = useState<boolean | null>(null)
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting')
  const [restarting, setRestarting] = useState(false)
  const [restartMessage, setRestartMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const terminalRef = useRef<ExpoTerminalHandle>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const status = await fetchExpoStatus()
        setRunning(status.running)
      } catch {
        setRunning(null)
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2000)
    return () => clearInterval(timer)
  }, [])

  const sendKeys = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data }))
    }
  }, [])

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
  }, [])

  useEffect(() => {
    if (healthOk !== true) {
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
      setWsState('closed')
      return
    }

    let disposed = false
    let liveSocket: WebSocket | null = null

    const connect = () => {
      if (disposed) return

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}${EXPO_PTY_WS_PATH}`
      setWsState('connecting')

      const ws = new WebSocket(url)
      liveSocket = ws
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed || liveSocket !== ws) return
        setWsState('open')
        terminalRef.current?.reset()
        const size = terminalRef.current?.getSize()
        if (size) sendResize(size.cols, size.rows)
      }

      ws.onmessage = (event) => {
        if (disposed || liveSocket !== ws) return
        const raw = String(event.data)
        try {
          const parsed = JSON.parse(raw) as { type?: string; data?: string }
          if (parsed.type === 'snapshot' && typeof parsed.data === 'string') {
            terminalRef.current?.write(parsed.data)
            return
          }
        } catch {
          // not JSON — ignore legacy raw frames
        }
      }

      ws.onerror = () => {
        if (disposed || liveSocket !== ws) return
        setWsState('error')
      }

      ws.onclose = () => {
        if (liveSocket !== ws) return

        liveSocket = null
        if (wsRef.current === ws) {
          wsRef.current = null
        }
        setWsState('closed')

        if (disposed) return

        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null
          if (!disposed) connect()
        }, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      disposed = true

      const ws = liveSocket
      liveSocket = null
      wsRef.current = null
      ws?.close()

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [healthOk])

  const onRestart = async () => {
    setRestarting(true)
    setRestartMessage(null)
    try {
      const result = await restartExpoService()
      if (result.ok) {
        terminalRef.current?.reset()
        setRestartMessage({ ok: true, text: 'Expo service restarted.' })
      } else {
        setRestartMessage({ ok: false, text: result.error ?? 'Restart failed' })
      }
    } catch (err) {
      setRestartMessage({
        ok: false,
        text: err instanceof Error ? err.message : 'Restart failed',
      })
    } finally {
      setRestarting(false)
    }
  }

  const wsStatusText =
    healthOk !== true
      ? 'Terminal: disconnected'
      : wsState === 'connecting'
        ? 'Terminal: connecting…'
        : wsState === 'open'
          ? 'Terminal: connected'
          : wsState === 'error'
            ? 'Terminal: error — reconnecting…'
            : 'Terminal: disconnected — reconnecting…'

  const statusText =
    running === null
      ? 'Checking…'
      : running
        ? 'tmux session running'
        : 'tmux session not found'

  return (
    <SectionPanel title={section.label} hint={section.hint}>
      <View style={developerStyles.row}>
        <View
          style={[
            developerStyles.dot,
            running ? developerStyles.dotOk : developerStyles.dotBad,
          ]}
        />
        <Text style={developerStyles.rowText}>{statusText}</Text>
      </View>

      <Text style={developerStyles.muted}>{wsStatusText}</Text>

      <Text style={developerStyles.inlineLabel}>Terminal</Text>
      <ExpoTerminal ref={terminalRef} onData={sendKeys} onResize={sendResize} />

      <Text style={developerStyles.inlineLabel}>Quick keys</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable
          style={[
            developerStyles.buttonSecondary,
            wsState !== 'open' && developerStyles.buttonDisabled,
          ]}
          onPress={() => sendKeys('r')}
          disabled={wsState !== 'open'}
        >
          <Text style={developerStyles.buttonSecondaryText}>r (Reload)</Text>
        </Pressable>
        <Pressable
          style={[
            developerStyles.buttonSecondary,
            wsState !== 'open' && developerStyles.buttonDisabled,
          ]}
          onPress={() => sendKeys('m')}
          disabled={wsState !== 'open'}
        >
          <Text style={developerStyles.buttonSecondaryText}>m (Menu)</Text>
        </Pressable>
        <Pressable
          style={[
            developerStyles.buttonSecondary,
            wsState !== 'open' && developerStyles.buttonDisabled,
          ]}
          onPress={() => sendKeys('j')}
          disabled={wsState !== 'open'}
        >
          <Text style={developerStyles.buttonSecondaryText}>j (Debugger)</Text>
        </Pressable>
      </View>

      <Text style={developerStyles.inlineLabel}>Service</Text>
      <Pressable
        style={[
          developerStyles.button,
          (restarting || !healthOk) && developerStyles.buttonDisabled,
        ]}
        onPress={() => void onRestart()}
        disabled={restarting || !healthOk}
      >
        {restarting ? (
          <ActivityIndicator color={colors.buttonText} />
        ) : (
          <Text style={developerStyles.buttonText}>Restart Expo service</Text>
        )}
      </Pressable>

      {restartMessage ? (
        <Text style={restartMessage.ok ? developerStyles.muted : developerStyles.error}>
          {restartMessage.text}
        </Text>
      ) : null}
    </SectionPanel>
  )
}
