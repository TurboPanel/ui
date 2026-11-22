import { setTimeout as sleep } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64url } from '@/lib/base64url'
import { FrameOpener, FrameSealer, importSessionKey } from '@/lib/terminal/crypto'
import {
  decodePlain,
  encodeAck,
  encodeClose,
  encodeData,
  encodeExit,
  encodeNotice,
  encodeResize,
  hexToBytes,
  type PlainMessage,
} from '@/lib/terminal/frames'
import vectors from '@/lib/terminal/frames.vectors.json'
import {
  ACK_EVERY_BYTES,
  ACK_EVERY_MS,
  RESIZE_DEBOUNCE_MS,
  STDIN_CHUNK_BYTES,
  STDIN_QUEUE_MAX_BYTES,
  STDIN_WINDOW_BYTES,
  TerminalSession,
  endForSocketClose,
  isValidDimension,
  parseControlFrame,
  defaultTerminalDeps,
  type SocketLike,
  type TerminalState,
} from '@/lib/terminal/session'

class FakeSocket implements SocketLike {
  binaryType = 'blob'
  sent: Uint8Array[] = []
  closed: { code?: number; reason?: string } | null = null
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  onerror: (() => void) | null = null
  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {}
  send(data: Uint8Array) {
    this.sent.push(data)
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason }
  }
}

const SID = vectors.sid
// WebCrypto finishes on another thread, so give it real time (the fake clock only covers setTimeout).
const flush = () => sleep(10)

async function setup(holdDraw = false) {
  const key = await importSessionKey(hexToBytes(vectors.keyHex))
  const sockets: FakeSocket[] = []
  const output: number[] = []
  const states: TerminalState[] = []
  const pendingDraws: (() => void)[] = []
  const session = new TerminalSession(
    {
      sid: SID,
      wsUrl: 'wss://cp.example.net/ws/client/v1/shell/x',
      ticket: 'tkt',
      key: bytesToBase64url(hexToBytes(vectors.keyHex)),
      idleSec: 600,
      maxSec: 3600,
    },
    { cols: 80, rows: 24 },
    {
      onData: (d, drawn) => {
        output.push(d.length)
        if (holdDraw) pendingDraws.push(drawn)
        else drawn()
      },
      onState: (s) => states.push(s),
    },
    {
      createSocket: (url, protocols) => {
        const socket = new FakeSocket(url, protocols)
        sockets.push(socket)
        return socket
      },
    }
  )
  await session.start()
  const socket = sockets[0]
  const daemon = new FrameSealer(key, SID, 1)
  const fromBrowser = new FrameOpener(key, SID, 0)
  const toBrowser = async (plain: Uint8Array) => {
    socket.onmessage?.({ data: (await daemon.seal(plain)).buffer })
    await flush()
  }
  const text = async (value: unknown) => {
    socket.onmessage?.({ data: JSON.stringify(value) })
    await flush()
  }
  const sentMessages = async (): Promise<PlainMessage[]> => {
    await flush()
    const out: PlainMessage[] = []
    for (const frame of socket.sent) out.push(decodePlain(await fromBrowser.open(frame)))
    socket.sent = []
    return out
  }
  const open = () => text({ type: 'opened', sid: SID, shell: '/bin/sh', user: 'root' })
  return {
    session,
    socket,
    sockets,
    output,
    states,
    pendingDraws,
    toBrowser,
    text,
    sentMessages,
    open,
    daemon,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('connect and control frames', () => {
  it('opens the socket with the ticket protocols and moves to connected', async () => {
    const t = await setup()
    expect(t.socket.protocols).toEqual(['tp-shell.v1', 'tp-ticket.tkt'])
    expect(t.socket.binaryType).toBe('arraybuffer')
    expect(t.session.state.phase).toBe('connecting')
    await t.open()
    expect(t.session.state).toMatchObject({ phase: 'connected', shell: '/bin/sh', user: 'root' })
    expect(t.session.sid).toBe(SID)
  })

  it('ends with the code of an error frame and with the closed frame as sent', async () => {
    const a = await setup()
    await a.text({ type: 'error', sid: SID, code: 'limit' })
    expect(a.session.state.end).toEqual({
      reason: 'refused',
      confirmed: true,
      code: 'limit',
      opened: false,
    })
    expect(a.socket.closed).not.toBeNull()
    const b = await setup()
    await b.open()
    await b.text({ type: 'closed', sid: SID, reason: 'exit', exitCode: 3, confirmed: true })
    expect(b.session.state.end).toEqual({
      reason: 'exit',
      confirmed: true,
      exitCode: 3,
      opened: true,
    })
    const c = await setup()
    await c.open()
    await c.text({ type: 'closed', sid: SID, reason: 'kill', confirmed: false })
    expect(c.session.state.end?.confirmed).toBe(false)
  })

  it('ignores unknown text and ends on a frame for another session', async () => {
    const t = await setup()
    await t.text({ type: 'weird', sid: SID })
    expect(t.session.state.phase).toBe('connecting')
    t.socket.onmessage?.({ data: 'not json' })
    await flush()
    expect(t.session.state.phase).toBe('connecting')
    await t.text({ type: 'opened', sid: '00000000-0000-4000-8000-000000000000' })
    expect(t.session.state.end).toMatchObject({ reason: 'protocol', code: 'sid' })
    expect(t.socket.closed?.code).toBe(4000)
  })

  it('ends on a non-text, non-binary message and on a binary frame sent before start', async () => {
    const t = await setup()
    t.socket.onmessage?.({ data: 5 })
    await flush()
    expect(t.session.state.end).toMatchObject({ reason: 'protocol', code: 'malformed' })
    t.socket.onmessage?.({ data: 'ignored after the end' })
    await flush()
  })

  it('ends as a bad key or when the socket cannot be created', async () => {
    const bad = new TerminalSession(
      { sid: SID, wsUrl: 'wss://x', ticket: 't', key: 'AAAA', idleSec: 1, maxSec: 1 },
      { cols: 80, rows: 24 },
      { onData: () => undefined, onState: () => undefined },
      { createSocket: () => new FakeSocket('', []) }
    )
    await bad.start()
    expect(bad.state.end).toMatchObject({ reason: 'protocol', code: 'key' })
    const noSocket = new TerminalSession(
      {
        sid: SID,
        wsUrl: 'wss://x',
        ticket: 't',
        key: bytesToBase64url(hexToBytes(vectors.keyHex)),
        idleSec: 1,
        maxSec: 1,
      },
      { cols: 80, rows: 24 },
      { onData: () => undefined, onState: () => undefined },
      {
        createSocket: () => {
          throw new Error('blocked')
        },
      }
    )
    await noSocket.start()
    expect(noSocket.state.end).toMatchObject({ reason: 'connection', confirmed: false })
    const badSid = new TerminalSession(
      {
        sid: 'nope',
        wsUrl: 'wss://x',
        ticket: 't',
        key: bytesToBase64url(hexToBytes(vectors.keyHex)),
        idleSec: 1,
        maxSec: 1,
      },
      { cols: 80, rows: 24 },
      { onData: () => undefined, onState: () => undefined },
      { createSocket: () => new FakeSocket('', []) }
    )
    await badSid.start()
    expect(badSid.state.end).toMatchObject({ reason: 'protocol', code: 'sid' })
  })
})

describe('output and acknowledgements', () => {
  it('acknowledges after 100 ms with the bytes received', async () => {
    const t = await setup()
    await t.open()
    await t.toBrowser(encodeData(new Uint8Array(100)))
    await t.toBrowser(encodeData(new Uint8Array(50)))
    expect(t.output).toEqual([100, 50])
    expect(await t.sentMessages()).toEqual([])
    vi.advanceTimersByTime(ACK_EVERY_MS)
    expect(await t.sentMessages()).toEqual([{ type: 'ack', bytes: 150 }])
    vi.advanceTimersByTime(ACK_EVERY_MS * 3)
    expect(await t.sentMessages()).toEqual([])
  })

  it('acknowledges at once at 64 KiB', async () => {
    const t = await setup()
    await t.open()
    await t.toBrowser(encodeData(new Uint8Array(ACK_EVERY_BYTES - 1)))
    expect(await t.sentMessages()).toEqual([])
    await t.toBrowser(encodeData(new Uint8Array(1)))
    expect(await t.sentMessages()).toEqual([{ type: 'ack', bytes: ACK_EVERY_BYTES }])
    // The pending timer was cleared: nothing more is sent.
    vi.advanceTimersByTime(ACK_EVERY_MS * 2)
    expect(await t.sentMessages()).toEqual([])
  })

  it('acknowledges only what the screen has drawn', async () => {
    const t = await setup(true)
    await t.open()
    for (let i = 0; i < 4; i++) await t.toBrowser(encodeData(new Uint8Array(ACK_EVERY_BYTES / 4)))
    await t.toBrowser(encodeData(new Uint8Array(10)))
    vi.advanceTimersByTime(ACK_EVERY_MS * 3)
    expect(await t.sentMessages()).toEqual([])
    for (let i = 0; i < 3; i++) t.pendingDraws[i]()
    expect(await t.sentMessages()).toEqual([])
    t.pendingDraws[3]()
    t.pendingDraws[3]() // a second call for the same bytes counts nothing
    expect(await t.sentMessages()).toEqual([{ type: 'ack', bytes: ACK_EVERY_BYTES }])
    t.pendingDraws[4]()
    vi.advanceTimersByTime(ACK_EVERY_MS)
    expect(await t.sentMessages()).toEqual([{ type: 'ack', bytes: 10 }])
  })

  it('counts nothing drawn after the session ended', async () => {
    const t = await setup(true)
    await t.open()
    await t.toBrowser(encodeData(new Uint8Array(100)))
    t.session.close()
    t.pendingDraws[0]()
    vi.advanceTimersByTime(ACK_EVERY_MS)
    const sent = await t.sentMessages()
    expect(sent.some((m) => m.type === 'ack')).toBe(false)
  })

  it('keeps the message rate far under the control plane budget at a high output rate', async () => {
    const t = await setup()
    await t.open()
    const frames = 1500
    const size = 16 * 1024
    for (let i = 0; i < frames; i++) {
      t.socket.onmessage?.({ data: (await t.daemon.seal(encodeData(new Uint8Array(size)))).buffer })
    }
    await flush()
    vi.advanceTimersByTime(ACK_EVERY_MS)
    const sent = await t.sentMessages()
    const acks = sent.filter((m) => m.type === 'ack')
    expect(t.output).toHaveLength(frames)
    const total = acks.reduce((sum, m) => sum + (m.type === 'ack' ? m.bytes : 0), 0)
    expect(total).toBe(frames * size)
    // 24 MiB of output is 384 acknowledgements; the budget is 2000 messages per 10 s.
    expect(acks.length).toBeLessThanOrEqual(Math.ceil((frames * size) / ACK_EVERY_BYTES))
    expect(acks.length).toBeLessThan(500)
  })
})

describe('socket events keep their order', () => {
  it('delivers a binary frame, a text frame and the close in order', async () => {
    const t = await setup()
    await t.open()
    t.socket.onmessage?.({ data: (await t.daemon.seal(encodeData(new Uint8Array(7)))).buffer })
    t.socket.onmessage?.({ data: (await t.daemon.seal(encodeExit(3))).buffer })
    t.socket.onmessage?.({ data: (await t.daemon.seal(encodeData(new Uint8Array(9)))).buffer })
    t.socket.onmessage?.({
      data: JSON.stringify({
        type: 'closed',
        sid: SID,
        reason: 'exit',
        confirmed: true,
        exitCode: 3,
      }),
    })
    t.socket.onclose?.({ code: 1000 })
    await flush()
    expect(t.output).toEqual([7, 9])
    expect(t.session.state.end).toMatchObject({ reason: 'exit', confirmed: true, exitCode: 3 })
  })

  it('does not end the session on a close before the frames sent ahead of it are read', async () => {
    const t = await setup()
    await t.open()
    t.socket.onmessage?.({ data: (await t.daemon.seal(encodeData(new Uint8Array(5)))).buffer })
    t.socket.onclose?.({ code: 4431 })
    await flush()
    expect(t.output).toEqual([5])
    expect(t.session.state.end).toMatchObject({ reason: 'daemon_lost', opened: true })
  })
})

describe('typed input and the 64 KiB window', () => {
  it('chunks input, holds what is past the window and releases it on ACK', async () => {
    const t = await setup()
    await t.open()
    expect(t.session.write(new Uint8Array(STDIN_WINDOW_BYTES + STDIN_CHUNK_BYTES))).toBe(true)
    const first = await t.sentMessages()
    expect(first).toHaveLength(STDIN_WINDOW_BYTES / STDIN_CHUNK_BYTES)
    for (const m of first) expect(m).toMatchObject({ type: 'data' })
    await t.toBrowser(encodeAck(STDIN_CHUNK_BYTES))
    const next = await t.sentMessages()
    expect(next).toHaveLength(1)
  })

  it('queues input until connected and refuses a huge paste or input after the end', async () => {
    const t = await setup()
    expect(t.session.write(Uint8Array.of(1))).toBe(true)
    expect(await t.sentMessages()).toEqual([])
    await t.open()
    expect(await t.sentMessages()).toHaveLength(1)
    expect(t.session.write(new Uint8Array(STDIN_QUEUE_MAX_BYTES + 1))).toBe(false)
    await t.text({ type: 'closed', sid: SID, reason: 'exit', confirmed: true })
    expect(t.session.write(Uint8Array.of(1))).toBe(false)
  })

  it('kills the session on an ACK for more than was sent', async () => {
    const t = await setup()
    await t.open()
    t.session.write(Uint8Array.of(1, 2, 3))
    await t.sentMessages()
    await t.toBrowser(encodeAck(4))
    expect(t.session.state.end).toMatchObject({ reason: 'protocol', code: 'counter' })
  })

  it('clears the idle notice on the next key press', async () => {
    const t = await setup()
    await t.open()
    await t.toBrowser(encodeNotice('This terminal closes in 60 seconds without input.'))
    expect(t.session.state.notice).toContain('60 seconds')
    t.session.write(Uint8Array.of(97))
    expect(t.session.state.notice).toBeNull()
  })
})

describe('resize', () => {
  it('sends one debounced resize, skips the unchanged size and bad sizes', async () => {
    const t = await setup()
    await t.open()
    t.session.resize(100, 30)
    t.session.resize(120, 40)
    t.session.resize(0, 40)
    t.session.resize(80, 2000)
    expect(await t.sentMessages()).toEqual([])
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS)
    expect(await t.sentMessages()).toEqual([{ type: 'resize', cols: 120, rows: 40 }])
    t.session.resize(120, 40)
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS)
    expect(await t.sentMessages()).toEqual([])
    expect(encodeResize(1, 1)).toHaveLength(5)
  })

  it('holds a resize that arrives before connected until it is open', async () => {
    const t = await setup()
    t.session.resize(90, 30)
    vi.advanceTimersByTime(RESIZE_DEBOUNCE_MS)
    await t.open()
    expect(await t.sentMessages()).toEqual([{ type: 'resize', cols: 90, rows: 30 }])
  })
})

describe('end of session', () => {
  it('ends confirmed on EXIT then CLOSE with the exit code', async () => {
    const t = await setup()
    await t.open()
    await t.toBrowser(encodeExit(2))
    await t.toBrowser(encodeClose(0))
    expect(t.session.state.end).toEqual({
      reason: 'exit',
      confirmed: true,
      exitCode: 2,
      opened: true,
    })
    await t.toBrowser(encodeData(Uint8Array.of(1)))
    expect(t.output).toEqual([])
  })

  it('ends on CLOSE without an exit code', async () => {
    const t = await setup()
    await t.open()
    await t.toBrowser(encodeClose(1))
    expect(t.session.state.end).toEqual({ reason: 'idle', confirmed: true, opened: true })
  })

  it('kills on a counter mismatch, a bad tag and a RESIZE from the daemon', async () => {
    const a = await setup()
    await a.open()
    await a.daemon.seal(encodeData(Uint8Array.of(1)))
    const skipped = await a.daemon.seal(encodeData(Uint8Array.of(2)))
    a.socket.onmessage?.({ data: skipped.buffer })
    await flush()
    expect(a.session.state.end).toMatchObject({
      reason: 'protocol',
      confirmed: false,
      code: 'counter',
    })
    expect(a.socket.closed?.code).toBe(4000)

    const b = await setup()
    await b.open()
    const tampered = await b.daemon.seal(encodeData(Uint8Array.of(1)))
    tampered[tampered.length - 1] ^= 1
    b.socket.onmessage?.({ data: tampered.buffer })
    await flush()
    expect(b.session.state.end).toMatchObject({ reason: 'protocol', code: 'tag' })

    const c = await setup()
    await c.open()
    await c.toBrowser(encodeResize(1, 1))
    expect(c.session.state.end).toMatchObject({ reason: 'protocol', code: 'direction' })

    const d = await setup()
    await d.open()
    await d.toBrowser(Uint8Array.of(9))
    expect(d.session.state.end).toMatchObject({ reason: 'protocol', code: 'plaintext' })
  })

  it('maps a socket close to an unconfirmed end', async () => {
    const t = await setup()
    await t.open()
    t.socket.onclose?.({ code: 4431 })
    await flush()
    expect(t.session.state.end).toEqual({ reason: 'daemon_lost', confirmed: false, opened: true })
    t.socket.onclose?.({ code: 1006 })
    await flush()
    expect(t.session.state.end?.reason).toBe('daemon_lost')
    expect(endForSocketClose(4428, false).reason).toBe('protocol')
    expect(endForSocketClose(4429, false).reason).toBe('budget')
    expect(endForSocketClose(4430, false).reason).toBe('max')
    expect(endForSocketClose(4432, false).reason).toBe('kill')
    expect(endForSocketClose(4433, false).reason).toBe('refused')
    expect(endForSocketClose(1006, true)).toEqual({
      reason: 'connection',
      confirmed: false,
      opened: true,
    })
  })

  it('close() sends CLOSE(client) then drops the socket, and never reconnects', async () => {
    const t = await setup()
    await t.open()
    t.session.close()
    expect(t.session.state.end).toEqual({ reason: 'client', confirmed: false, opened: true })
    expect(await t.sentMessages()).toEqual([{ type: 'close', reason: 4 }])
    await flush()
    expect(t.socket.closed).toEqual({ code: 1000, reason: 'client' })
    t.session.close()
    t.socket.onclose?.({ code: 1006 })
    expect(t.sockets).toHaveLength(1)
  })

  it('close() before the socket exists just ends', async () => {
    const session = new TerminalSession(
      { sid: SID, wsUrl: 'wss://x', ticket: 't', key: 'AAAA', idleSec: 1, maxSec: 1 },
      { cols: 1, rows: 1 },
      { onData: () => undefined, onState: () => undefined },
      { createSocket: () => new FakeSocket('', []) }
    )
    session.close()
    expect(session.state.end?.reason).toBe('client')
    await session.start()
    expect(session.state.end?.reason).toBe('client')
  })
})

describe('failure paths', () => {
  it('sends input sealed before a close ahead of the CLOSE frame, in counter order', async () => {
    const t = await setup()
    await t.open()
    t.session.write(Uint8Array.of(1))
    t.session.close()
    await flush()
    const sent = await t.sentMessages()
    expect(sent.map((m) => m.type)).toEqual(['data', 'close'])
  })

  it('drops a frame that finished sealing after the connection was lost', async () => {
    const t = await setup()
    await t.open()
    t.session.write(Uint8Array.of(1))
    t.socket.onclose?.({ code: 1006 })
    await flush()
    expect(t.socket.sent).toEqual([])
  })

  it('ends when a frame cannot be sealed', async () => {
    const t = await setup()
    await t.open()
    const spy = vi.spyOn(FrameSealer.prototype, 'seal').mockRejectedValueOnce(new Error('x'))
    t.session.write(Uint8Array.of(1))
    await flush()
    spy.mockRestore()
    expect(t.session.state.end).toMatchObject({ reason: 'protocol', code: 'malformed' })
  })

  it('still drops the socket when the CLOSE frame cannot be sent', async () => {
    const t = await setup()
    await t.open()
    t.socket.send = () => {
      throw new Error('gone')
    }
    t.session.close()
    await flush()
    expect(t.socket.closed).toEqual({ code: 1000, reason: 'client' })
  })

  it('does nothing when it was closed before the key was ready', async () => {
    const session = new TerminalSession(
      {
        sid: SID,
        wsUrl: 'wss://x',
        ticket: 't',
        key: bytesToBase64url(hexToBytes(vectors.keyHex)),
        idleSec: 1,
        maxSec: 1,
      },
      { cols: 1, rows: 1 },
      { onData: () => undefined, onState: () => undefined },
      {
        createSocket: () => {
          throw new Error('must not open')
        },
      }
    )
    session.close()
    await session.start()
    expect(session.state.end?.reason).toBe('client')
  })
})

describe('helpers', () => {
  it('parses control frames and validates sizes', () => {
    expect(parseControlFrame('[]')).toBeNull()
    expect(parseControlFrame('{"type":"opened"}')).toBeNull()
    expect(parseControlFrame(`{"type":"opened","sid":"${SID}"}`)).toEqual({
      type: 'opened',
      sid: SID,
      shell: '',
      user: '',
    })
    expect(parseControlFrame(`{"type":"error","sid":"${SID}"}`)).toBeNull()
    expect(parseControlFrame(`{"type":"closed","sid":"${SID}","reason":"idle"}`)).toEqual({
      type: 'closed',
      sid: SID,
      reason: 'idle',
      confirmed: false,
    })
    expect(isValidDimension(1000)).toBe(true)
    expect(isValidDimension(1001)).toBe(false)
    expect(isValidDimension(1.5)).toBe(false)
  })

  it('builds a real WebSocket by default', () => {
    const original = globalThis.WebSocket
    const made: unknown[] = []
    globalThis.WebSocket = class {
      constructor(...args: unknown[]) {
        made.push(args)
      }
    } as unknown as typeof WebSocket
    defaultTerminalDeps.createSocket('wss://x', ['a'])
    globalThis.WebSocket = original
    expect(made).toEqual([['wss://x', ['a']]])
  })
})
