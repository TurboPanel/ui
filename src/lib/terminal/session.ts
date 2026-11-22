/**
 * One browser terminal session: the socket, the frame counters, flow control
 * and the state a screen shows. No part of it touches the page, so it runs
 * under test with a fake socket.
 *
 * Rules (see `frames.ts` for the wire):
 * - the socket opens once, from a grant the control plane just minted; there is
 *   no reconnect, a new terminal needs a new grant;
 * - output is acknowledged once the screen has drawn it, every 64 KiB or
 *   100 ms, whichever comes first, so a slow screen slows the shell down;
 * - everything from the socket (text frames, binary frames, the close) is
 *   handled in the order it arrived, even though decrypting takes time;
 * - at most 64 KiB of typed input is unacknowledged at any time, the rest waits;
 * - a resize is sent after the size has been still for 100 ms;
 * - any frame that does not authenticate, or arrives out of order, ends the
 *   session at once.
 */
import { base64urlToBytes } from '@/lib/base64url'
import { FrameOpener, FrameSealer, importSessionKey } from '@/lib/terminal/crypto'
import {
  CLOSE_REASONS,
  FrameError,
  closeReasonName,
  decodePlain,
  encodeAck,
  encodeClose,
  encodeData,
  encodeResize,
  isSid,
  type PlainMessage,
} from '@/lib/terminal/frames'

export const SHELL_PROTOCOL = 'tp-shell.v1'
export const TICKET_PROTOCOL_PREFIX = 'tp-ticket.'

export const ACK_EVERY_BYTES = 64 * 1024
export const ACK_EVERY_MS = 100
export const STDIN_WINDOW_BYTES = 64 * 1024
/** One DATA frame of typed or pasted input; the control plane caps a frame at 16 KiB. */
export const STDIN_CHUNK_BYTES = 8 * 1024
/** Input waiting for the window; a larger paste is refused rather than buffered. */
export const STDIN_QUEUE_MAX_BYTES = 1024 * 1024
export const RESIZE_DEBOUNCE_MS = 100
const MAX_DIM = 1000

/** Close codes the control plane puts on the browser's socket. */
export const SOCKET_CLOSE = {
  protocol: 4428,
  budget: 4429,
  expired: 4430,
  daemonLost: 4431,
  killed: 4432,
  failed: 4433,
} as const
const CLIENT_KILL_CODE = 4000

/** What the control plane's `POST .../terminal-sessions` answers, with the socket as a full URL. */
export type TerminalGrant = {
  sid: string
  wsUrl: string
  ticket: string
  key: string
  idleSec: number
  maxSec: number
}

export type TerminalPhase = 'connecting' | 'connected' | 'ended'

export type TerminalEnd = {
  /**
   * The daemon's reason (`exit`, `idle`, `max`, `kill`, `client`, `error`,
   * `daemon-restart`), or ours: `refused` (the open failed, see `code`),
   * `protocol` (a frame did not check out), `connection` (the socket dropped),
   * `daemon_lost`, `budget`.
   */
  reason: string
  /** The daemon itself said the shell ended. False means nobody could confirm it. */
  confirmed: boolean
  exitCode?: number
  /** The open error code of a `refused` end, or the frame error code of a `protocol` end. */
  code?: string
  /** The terminal had been opened before it ended. */
  opened: boolean
}

export type TerminalState = {
  phase: TerminalPhase
  shell: string | null
  user: string | null
  /** The idle warning the daemon sent, until the next key press. */
  notice: string | null
  end: TerminalEnd | null
}

export type TerminalHandlers = {
  /**
   * Output bytes for the screen, in order. Call `drawn` once the screen has
   * taken the bytes in (for xterm, from the `write` callback): only drawn bytes
   * are acknowledged to the daemon.
   */
  onData: (data: Uint8Array, drawn: () => void) => void
  onState: (state: TerminalState) => void
}

export type SocketLike = {
  binaryType: string
  send: (data: Uint8Array) => void
  close: (code?: number, reason?: string) => void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number }) => void) | null
  onerror: (() => void) | null
}

export type TerminalDeps = {
  createSocket: (url: string, protocols: string[]) => SocketLike
}

export const defaultTerminalDeps: TerminalDeps = {
  createSocket: (url, protocols) => new WebSocket(url, protocols) as unknown as SocketLike,
}

/** A text control frame the control plane sends on the socket. */
export type ControlFrame =
  | { type: 'opened'; sid: string; shell: string; user: string }
  | { type: 'closed'; sid: string; reason: string; exitCode?: number; confirmed: boolean }
  | { type: 'error'; sid: string; code: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The control frame in a text message, or null when it is not one this client knows. */
export function parseControlFrame(text: string): ControlFrame | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value) || typeof value.sid !== 'string') return null
  const sid = value.sid
  if (value.type === 'opened') {
    return {
      type: 'opened',
      sid,
      shell: typeof value.shell === 'string' ? value.shell : '',
      user: typeof value.user === 'string' ? value.user : '',
    }
  }
  if (value.type === 'error' && typeof value.code === 'string') {
    return { type: 'error', sid, code: value.code }
  }
  if (value.type === 'closed' && typeof value.reason === 'string') {
    return {
      type: 'closed',
      sid,
      reason: value.reason,
      ...(typeof value.exitCode === 'number' ? { exitCode: value.exitCode } : {}),
      confirmed: value.confirmed === true,
    }
  }
  return null
}

/** How a socket that closed by itself ended the session. */
export function endForSocketClose(code: number, opened: boolean): TerminalEnd {
  switch (code) {
    case SOCKET_CLOSE.protocol:
      return { reason: 'protocol', confirmed: false, opened }
    case SOCKET_CLOSE.budget:
      return { reason: 'budget', confirmed: false, opened }
    case SOCKET_CLOSE.expired:
      return { reason: 'max', confirmed: false, opened }
    case SOCKET_CLOSE.daemonLost:
      return { reason: 'daemon_lost', confirmed: false, opened }
    case SOCKET_CLOSE.killed:
      return { reason: 'kill', confirmed: false, opened }
    case SOCKET_CLOSE.failed:
      return { reason: 'refused', confirmed: false, opened }
    default:
      return { reason: 'connection', confirmed: false, opened }
  }
}

export function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_DIM
}

export class TerminalSession {
  readonly #grant: TerminalGrant
  readonly #handlers: TerminalHandlers
  readonly #deps: TerminalDeps
  /** The socket with its two frame counters; set once, when the socket is created. */
  #link: { socket: SocketLike; sealer: FrameSealer; opener: FrameOpener } | null = null
  #state: TerminalState = {
    phase: 'connecting',
    shell: null,
    user: null,
    notice: null,
    end: null,
  }
  #exitCode: number | undefined
  /** Socket events run one after another in arrival order. */
  #inbound: Promise<void> = Promise.resolve()
  #outUnacked = 0
  #ackTimer: ReturnType<typeof setTimeout> | undefined
  #stdinUnacked = 0
  #stdinQueue: Uint8Array[] = []
  #stdinQueued = 0
  #sentSize: { cols: number; rows: number }
  #wantedSize: { cols: number; rows: number } | null = null
  #resizeTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    grant: TerminalGrant,
    size: { cols: number; rows: number },
    handlers: TerminalHandlers,
    deps: TerminalDeps = defaultTerminalDeps
  ) {
    this.#grant = grant
    this.#handlers = handlers
    this.#deps = deps
    this.#sentSize = size
  }

  get state(): TerminalState {
    return this.#state
  }

  get sid(): string {
    return this.#grant.sid
  }

  /** Imports the key and opens the socket. Resolves once the socket is created. */
  async start(): Promise<void> {
    let key: CryptoKey
    try {
      key = await importSessionKey(base64urlToBytes(this.#grant.key))
    } catch {
      this.#finish({ reason: 'protocol', confirmed: false, code: 'key', opened: false })
      return
    }
    if (this.#state.phase === 'ended' || !isSid(this.#grant.sid)) {
      if (this.#state.phase !== 'ended') {
        this.#finish({ reason: 'protocol', confirmed: false, code: 'sid', opened: false })
      }
      return
    }
    this.#connect(new FrameSealer(key, this.#grant.sid), new FrameOpener(key, this.#grant.sid))
  }

  #connect(sealer: FrameSealer, opener: FrameOpener): void {
    const protocols = [SHELL_PROTOCOL, `${TICKET_PROTOCOL_PREFIX}${this.#grant.ticket}`]
    let socket: SocketLike
    try {
      socket = this.#deps.createSocket(this.#grant.wsUrl, protocols)
    } catch {
      this.#finish({ reason: 'connection', confirmed: false, opened: false })
      return
    }
    socket.binaryType = 'arraybuffer'
    socket.onmessage = (event) => this.#enqueue(() => this.#onMessage(event.data, opener))
    socket.onclose = (event) =>
      this.#enqueue(() => {
        if (this.#state.phase === 'ended') return
        this.#finish(endForSocketClose(event.code, this.#opened), false)
      })
    this.#link = { socket, sealer, opener }
  }

  get #opened(): boolean {
    return this.#state.phase === 'connected'
  }

  /**
   * Runs `step` after every earlier socket event has finished. A binary frame
   * waits on WebCrypto, so a text frame or the close that follows it must wait
   * too, or the last output would be dropped.
   */
  #enqueue(step: () => void | Promise<void>): void {
    this.#inbound = this.#inbound.then(step).catch((error: unknown) => {
      this.#kill(error instanceof FrameError ? error.code : 'malformed')
    })
  }

  async #onMessage(data: unknown, opener: FrameOpener): Promise<void> {
    if (this.#state.phase === 'ended') return
    if (typeof data === 'string') {
      this.#onControl(data)
    } else if (data instanceof ArrayBuffer) {
      this.#onPlain(decodePlain(await opener.open(new Uint8Array(data))))
    } else {
      this.#kill('malformed')
    }
  }

  #onControl(text: string): void {
    const frame = parseControlFrame(text)
    if (!frame) return
    if (frame.sid.toLowerCase() !== this.#grant.sid.toLowerCase()) {
      this.#kill('sid')
      return
    }
    if (frame.type === 'opened') {
      this.#setState({ phase: 'connected', shell: frame.shell, user: frame.user })
      this.#pump()
      this.#flushResize()
    } else if (frame.type === 'error') {
      this.#finish({ reason: 'refused', confirmed: true, code: frame.code, opened: this.#opened })
    } else {
      this.#finish({
        reason: frame.reason,
        confirmed: frame.confirmed,
        ...(frame.exitCode === undefined ? {} : { exitCode: frame.exitCode }),
        opened: this.#opened,
      })
    }
  }

  #onPlain(message: PlainMessage): void {
    if (this.#state.phase === 'ended') return
    switch (message.type) {
      case 'data':
        this.#onOutput(message.data)
        break
      case 'ack':
        this.#onStdinAck(message.bytes)
        break
      case 'exit':
        this.#exitCode = message.code
        break
      case 'close':
        this.#finish({
          reason: closeReasonName(message.reason),
          confirmed: true,
          ...(this.#exitCode === undefined ? {} : { exitCode: this.#exitCode }),
          opened: this.#opened,
        })
        break
      case 'notice':
        this.#setState({ notice: message.text })
        break
      default:
        // A RESIZE only goes from the browser to the daemon.
        this.#kill('direction')
    }
  }

  #onOutput(data: Uint8Array): void {
    let counted = false
    this.#handlers.onData(data, () => {
      if (counted) return
      counted = true
      this.#onDrawn(data.length)
    })
  }

  /** The screen has drawn `bytes` of output: they may be acknowledged. */
  #onDrawn(bytes: number): void {
    if (this.#state.phase === 'ended') return
    this.#outUnacked += bytes
    if (this.#outUnacked >= ACK_EVERY_BYTES) {
      this.#flushAck()
    } else if (this.#ackTimer === undefined) {
      this.#ackTimer = setTimeout(() => this.#flushAck(), ACK_EVERY_MS)
    }
  }

  #flushAck(): void {
    if (this.#ackTimer !== undefined) clearTimeout(this.#ackTimer)
    this.#ackTimer = undefined
    if (this.#outUnacked === 0 || this.#state.phase === 'ended') return
    const bytes = this.#outUnacked
    this.#outUnacked = 0
    this.#sendPlain(encodeAck(bytes))
  }

  #onStdinAck(bytes: number): void {
    // An ACK for more than was sent is a forged window.
    if (bytes > this.#stdinUnacked) {
      this.#kill('counter')
      return
    }
    this.#stdinUnacked -= bytes
    this.#pump()
  }

  /** Typed or pasted bytes. False when the input was refused (ended, or too much waiting). */
  write(data: Uint8Array): boolean {
    if (this.#state.phase === 'ended') return false
    if (this.#stdinQueued + data.length > STDIN_QUEUE_MAX_BYTES) return false
    for (let at = 0; at < data.length; at += STDIN_CHUNK_BYTES) {
      this.#stdinQueue.push(data.subarray(at, at + STDIN_CHUNK_BYTES))
    }
    this.#stdinQueued += data.length
    if (this.#state.notice !== null) this.#setState({ notice: null })
    this.#pump()
    return true
  }

  #pump(): void {
    if (this.#state.phase !== 'connected') return
    for (let head = this.#stdinQueue[0]; head; head = this.#stdinQueue[0]) {
      if (this.#stdinUnacked + head.length > STDIN_WINDOW_BYTES) break
      this.#stdinQueue.shift()
      this.#stdinQueued -= head.length
      this.#stdinUnacked += head.length
      this.#sendPlain(encodeData(head))
    }
  }

  /** The screen changed size; the daemon is told once the size has been still. */
  resize(cols: number, rows: number): void {
    if (this.#state.phase === 'ended' || !isValidDimension(cols) || !isValidDimension(rows)) return
    this.#wantedSize = { cols, rows }
    if (this.#resizeTimer !== undefined) clearTimeout(this.#resizeTimer)
    this.#resizeTimer = setTimeout(() => this.#flushResize(), RESIZE_DEBOUNCE_MS)
  }

  #flushResize(): void {
    this.#resizeTimer = undefined
    const wanted = this.#wantedSize
    if (!wanted || this.#state.phase !== 'connected') return
    this.#wantedSize = null
    if (wanted.cols === this.#sentSize.cols && wanted.rows === this.#sentSize.rows) return
    this.#sentSize = wanted
    this.#sendPlain(encodeResize(wanted.cols, wanted.rows))
  }

  #sendPlain(plain: Uint8Array): void {
    const link = this.#link
    if (!link) return
    link.sealer
      .seal(plain)
      .then((frame) => {
        // Frames sealed before a close still go out, so the counters the daemon sees stay in a row.
        if (this.#state.phase !== 'ended' || this.#state.end?.reason === 'client') {
          link.socket.send(frame)
        }
      })
      .catch(() => this.#kill('malformed'))
  }

  /** The person closed the terminal: tell the daemon, then drop the socket. */
  close(): void {
    if (this.#state.phase === 'ended') return
    const link = this.#link
    this.#finish({ reason: 'client', confirmed: false, opened: this.#opened }, false)
    if (!link) return
    link.sealer
      .seal(encodeClose(CLOSE_REASONS.client))
      .then((frame) => link.socket.send(frame))
      .catch(() => undefined)
      .finally(() => link.socket.close(1000, 'client'))
  }

  /** A frame did not check out: end now and drop the socket. */
  #kill(code: string): void {
    this.#finish({ reason: 'protocol', confirmed: false, code, opened: this.#opened })
  }

  #finish(end: TerminalEnd, closeSocket = true): void {
    if (this.#state.phase === 'ended') return
    for (const timer of [this.#ackTimer, this.#resizeTimer]) {
      if (timer !== undefined) clearTimeout(timer)
    }
    this.#ackTimer = undefined
    this.#resizeTimer = undefined
    this.#stdinQueue = []
    this.#stdinQueued = 0
    this.#setState({ phase: 'ended', notice: null, end })
    if (closeSocket) {
      try {
        this.#link?.socket.close(end.reason === 'protocol' ? CLIENT_KILL_CODE : 1000, end.reason)
      } catch {
        // The socket is already gone.
      }
    }
  }

  #setState(change: Partial<TerminalState>): void {
    this.#state = { ...this.#state, ...change }
    this.#handlers.onState(this.#state)
  }
}
