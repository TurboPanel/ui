/**
 * Binary frames of the web terminal. The layout is the daemon's `frames.ts`
 * (`TurboPanel/turbopaneld`, `src/shell/frames.ts`) and the vectors file next to
 * this one is a copy of its `frames.vectors.json`:
 *
 *   off len field
 *   0   1   version 0x01
 *   1   16  sid (raw UUID bytes)
 *   17  1   dir: 0x00 browser to daemon, 0x01 daemon to browser
 *   18  8   ctr, u64 big endian (0 first, then strictly +1 per direction)
 *   26  n   AES-256-GCM ciphertext || 16-byte tag
 *
 * The plaintext starts with a type byte. This module is the pure part (header,
 * plaintext messages); `crypto.ts` seals and opens.
 */

export const FRAME_VERSION = 0x01
export const DIR_BROWSER_TO_DAEMON = 0x00
export const DIR_DAEMON_TO_BROWSER = 0x01
export const HEADER_BYTES = 26
export const TAG_BYTES = 16
/** Longest plaintext (type byte included) one frame may carry. */
export const MAX_PLAINTEXT_BYTES = 64 * 1024
export const KEY_BYTES = 32

export type Direction = typeof DIR_BROWSER_TO_DAEMON | typeof DIR_DAEMON_TO_BROWSER

export const TYPE_DATA = 0x01
export const TYPE_RESIZE = 0x02
export const TYPE_ACK = 0x03
export const TYPE_CLOSE = 0x04
export const TYPE_EXIT = 0x05
export const TYPE_NOTICE = 0x06

/** Reason byte of a CLOSE frame. */
export const CLOSE_REASONS = {
  exit: 0,
  idle: 1,
  max: 2,
  kill: 3,
  client: 4,
  error: 5,
  'daemon-restart': 6,
} as const
export type CloseReason = keyof typeof CLOSE_REASONS

export type FrameErrorCode =
  'malformed' | 'version' | 'sid' | 'direction' | 'counter' | 'tag' | 'oversize' | 'plaintext'

export class FrameError extends Error {
  readonly code: FrameErrorCode
  constructor(code: FrameErrorCode, message: string) {
    super(message)
    this.name = 'FrameError'
    this.code = code
  }
}

export type PlainMessage =
  | { type: 'data'; data: Uint8Array }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'ack'; bytes: number }
  | { type: 'close'; reason: number }
  | { type: 'exit'; code: number }
  | { type: 'notice'; text: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8', { fatal: true })

export function isSid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** The 16 raw bytes of a UUID string. */
export function sidToBytes(sid: string): Uint8Array {
  if (!isSid(sid)) throw new FrameError('sid', 'sid is not a UUID')
  const hex = sid.replaceAll('-', '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

/** The 26-byte header of one frame; it is also the AES-GCM additional data. */
export function headerFor(sid: Uint8Array, dir: Direction, ctr: bigint): Uint8Array {
  const header = new Uint8Array(HEADER_BYTES)
  header[0] = FRAME_VERSION
  header.set(sid, 1)
  header[17] = dir
  new DataView(header.buffer).setBigUint64(18, ctr, false)
  return header
}

/** `0x00 0x00 0x00 dir || ctr(8)`. */
export function nonceFor(dir: Direction, ctr: bigint): Uint8Array {
  const nonce = new Uint8Array(12)
  nonce[3] = dir
  new DataView(nonce.buffer).setBigUint64(4, ctr, false)
  return nonce
}

function withType(type: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + body.length)
  out[0] = type
  out.set(body, 1)
  return out
}

export function encodeData(data: Uint8Array): Uint8Array {
  return withType(TYPE_DATA, data)
}

export function encodeResize(cols: number, rows: number): Uint8Array {
  const body = new Uint8Array(4)
  const view = new DataView(body.buffer)
  view.setUint16(0, cols, false)
  view.setUint16(2, rows, false)
  return withType(TYPE_RESIZE, body)
}

export function encodeAck(bytes: number): Uint8Array {
  const body = new Uint8Array(4)
  new DataView(body.buffer).setUint32(0, bytes, false)
  return withType(TYPE_ACK, body)
}

export function encodeClose(reason: number): Uint8Array {
  return withType(TYPE_CLOSE, Uint8Array.of(reason))
}

export function encodeExit(code: number): Uint8Array {
  const body = new Uint8Array(4)
  new DataView(body.buffer).setInt32(0, code, false)
  return withType(TYPE_EXIT, body)
}

export function encodeNotice(text: string): Uint8Array {
  return withType(TYPE_NOTICE, textEncoder.encode(text))
}

function bad(name: string): never {
  throw new FrameError('plaintext', `${name} has the wrong length`)
}

function decodeNotice(body: Uint8Array): PlainMessage {
  try {
    return { type: 'notice', text: textDecoder.decode(body) }
  } catch {
    throw new FrameError('plaintext', 'notice is not UTF-8')
  }
}

/** Decode one plaintext; any shape that does not match its type is a {@link FrameError}. */
export function decodePlain(plain: Uint8Array): PlainMessage {
  if (plain.length === 0) throw new FrameError('plaintext', 'empty plaintext')
  const view = new DataView(plain.buffer, plain.byteOffset, plain.length)
  switch (plain[0]) {
    case TYPE_DATA:
      return { type: 'data', data: plain.subarray(1) }
    case TYPE_RESIZE:
      return plain.length === 5
        ? { type: 'resize', cols: view.getUint16(1, false), rows: view.getUint16(3, false) }
        : bad('resize')
    case TYPE_ACK:
      return plain.length === 5 ? { type: 'ack', bytes: view.getUint32(1, false) } : bad('ack')
    case TYPE_CLOSE:
      return plain.length === 2 ? { type: 'close', reason: plain[1] } : bad('close')
    case TYPE_EXIT:
      return plain.length === 5 ? { type: 'exit', code: view.getInt32(1, false) } : bad('exit')
    case TYPE_NOTICE:
      return decodeNotice(plain.subarray(1))
    default:
      throw new FrameError('plaintext', 'unknown plaintext type')
  }
}

/** The name of a CLOSE frame's reason byte, or `error` for a byte nobody defined. */
export function closeReasonName(byte: number): CloseReason {
  for (const [name, value] of Object.entries(CLOSE_REASONS)) {
    if (value === byte) return name as CloseReason
  }
  return 'error'
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}
