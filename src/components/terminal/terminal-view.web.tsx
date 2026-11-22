import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { panelStyles } from '@/components/ui/panel-styles'
import type { TerminalViewProps } from '@/components/terminal/terminal-view-types'
import { endTerminalSession, openTerminalSession, terminalSocketUrl } from '@/lib/instance-api'
import { statusText, terminalErrorMessage } from '@/lib/terminal/errors'
import { binaryStringBytes } from '@/lib/terminal/gate'
import { TerminalSession, type TerminalState } from '@/lib/terminal/session'
import { useColors } from '@/lib/theme-preference'
import { useRegisterOpenDialog } from '@/lib/version-prompt-gate'

const INITIAL: TerminalState = {
  phase: 'connecting',
  shell: null,
  user: null,
  notice: null,
  end: null,
}
const encoder = new TextEncoder()
const COPIED_MS = 1500
const DROPPED_INPUT = 'That input was too large to send and was dropped.'

/** Looks up the clipboard without throwing where it is blocked. */
async function readClipboard(): Promise<string> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return ''
  }
}

/**
 * A browser terminal into one container. xterm loads when this opens, so it is
 * not in the main bundle. The session never reconnects: when it ends the
 * status bar says why and a new terminal needs the Open button again.
 */
export function TerminalView({
  serverId,
  containerId,
  user,
  onClose,
  onOpenError,
}: TerminalViewProps) {
  const colors = useColors()
  const host = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<TerminalSession | null>(null)
  const [state, setState] = useState<TerminalState>(INITIAL)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [dropped, setDropped] = useState(false)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const selectionRef = useRef<() => string>(() => '')
  const pasteRef = useRef<(text: string) => void>(() => undefined)
  // The terminal holds the new-version prompt back until the person closes it,
  // also after the shell has ended, like any dialog.
  useRegisterOpenDialog(true)
  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  useEffect(() => {
    let cancelled = false
    let dispose = () => undefined as void
    const element = host.current
    if (!element) return undefined
    const run = async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/xterm/css/xterm.css'),
      ])
      if (cancelled) return
      const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'monospace',
        fontSize: 13,
        theme: { background: colors.bg, foreground: colors.text, cursor: colors.accent },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(element)
      fit.fit()
      let session: TerminalSession
      try {
        const grant = await openTerminalSession(serverId, {
          containerId,
          ...(user?.trim() ? { user: user.trim() } : {}),
          cols: term.cols,
          rows: term.rows,
        })
        if (cancelled) {
          term.dispose()
          // The grant is already minted: end it so it does not sit open on the server.
          void endTerminalSession(serverId, grant.sid).catch(() => undefined)
          return
        }
        session = new TerminalSession(
          { ...grant, wsUrl: terminalSocketUrl(grant.wsUrl) },
          { cols: term.cols, rows: term.rows },
          { onData: (data, drawn) => term.write(data, drawn), onState: setState }
        )
      } catch (err) {
        term.dispose()
        if (cancelled) return
        setError(terminalErrorMessage(err))
        onOpenError?.(err)
        return
      }
      sessionRef.current = session
      const send = (bytes: Uint8Array) =>
        setDropped(!session.write(bytes) && session.state.phase !== 'ended')
      const input = term.onData((text) => send(encoder.encode(text)))
      const binary = term.onBinary((text) => send(binaryStringBytes(text)))
      const sized = term.onResize(({ cols, rows }) => session.resize(cols, rows))
      const observer = new ResizeObserver(() => fit.fit())
      observer.observe(element)
      selectionRef.current = () => term.getSelection()
      pasteRef.current = (text) => term.paste(text)
      dispose = () => {
        observer.disconnect()
        input.dispose()
        binary.dispose()
        sized.dispose()
        session.close()
        term.dispose()
      }
      await session.start()
      if (cancelled) dispose()
      else term.focus()
    }
    void run()
    return () => {
      cancelled = true
      dispose()
    }
    // One terminal per mount: a new container or user is a new mount (keyed by the caller).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = async () => {
    const text = selectionRef.current()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS)
    } catch {
      setCopied(false)
    }
  }
  const paste = async () => {
    const text = await readClipboard()
    if (text) pasteRef.current(text)
  }

  const ended = state.phase === 'ended' || error !== null
  const status = error ?? statusText(state)
  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
        <Text style={panelStyles.muted} accessibilityLiveRegion="polite">
          {status}
        </Text>
        <View style={styles.actions}>
          <Button
            label={copied ? 'Copied' : 'Copy'}
            size="sm"
            onPress={() => void copy()}
            disabled={ended}
          />
          <Button label="Paste" size="sm" onPress={() => void paste()} disabled={ended} />
          <Button
            label={ended ? 'Close' : 'End Terminal'}
            size="sm"
            variant={ended ? 'secondary' : 'danger'}
            onPress={() => {
              sessionRef.current?.close()
              onClose()
            }}
          />
        </View>
      </View>
      {state.notice ? <Text style={panelStyles.muted}>{state.notice}</Text> : null}
      {dropped ? <Text style={panelStyles.error}>{DROPPED_INPUT}</Text> : null}
      <div
        ref={host}
        style={{ height: 360, width: '100%', backgroundColor: colors.bg, padding: 4 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actions: { flexDirection: 'row', gap: 8 },
})
