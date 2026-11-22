/**
 * AES-256-GCM sealing and opening of terminal frames with WebCrypto. One
 * sealer per direction on the way out and one opener on the way in: each keeps
 * its own counter, which runs 0, 1, 2, ... and never skips. An opener that sees
 * any other counter, a bad tag, the wrong direction or the wrong session throws
 * a {@link FrameError}; the caller ends the session on the first one.
 */
import {
  DIR_BROWSER_TO_DAEMON,
  DIR_DAEMON_TO_BROWSER,
  FRAME_VERSION,
  FrameError,
  HEADER_BYTES,
  KEY_BYTES,
  MAX_PLAINTEXT_BYTES,
  TAG_BYTES,
  headerFor,
  nonceFor,
  sidToBytes,
  type Direction,
} from '@/lib/terminal/frames'

const MIN_FRAME_BYTES = HEADER_BYTES + TAG_BYTES + 1
const MAX_FRAME_BYTES = HEADER_BYTES + MAX_PLAINTEXT_BYTES + TAG_BYTES

export function importSessionKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) {
    throw new FrameError('malformed', 'session key must be 32 bytes')
  }
  return globalThis.crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Runs the steps one after another, whatever order they were asked in. */
class Serial {
  #tail: Promise<unknown> = Promise.resolve()

  run<T>(step: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(step)
    this.#tail = result.catch(() => undefined)
    return result
  }
}

/** Seals the frames of one direction; counters follow the order of the calls. */
export class FrameSealer {
  readonly #key: CryptoKey
  readonly #sid: Uint8Array
  readonly #dir: Direction
  readonly #serial = new Serial()
  #ctr = 0n

  constructor(key: CryptoKey, sid: string, dir: Direction = DIR_BROWSER_TO_DAEMON) {
    this.#key = key
    this.#sid = sidToBytes(sid)
    this.#dir = dir
  }

  get nextCounter(): bigint {
    return this.#ctr
  }

  seal(plaintext: Uint8Array): Promise<Uint8Array> {
    return this.#serial.run(() => this.#sealNow(plaintext))
  }

  async #sealNow(plaintext: Uint8Array): Promise<Uint8Array> {
    if (plaintext.length === 0 || plaintext.length > MAX_PLAINTEXT_BYTES) {
      throw new FrameError('oversize', 'plaintext length is out of range')
    }
    const ctr = this.#ctr
    this.#ctr += 1n
    const header = headerFor(this.#sid, this.#dir, ctr)
    const sealed = new Uint8Array(
      await globalThis.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonceFor(this.#dir, ctr) as BufferSource,
          additionalData: header as BufferSource,
          tagLength: TAG_BYTES * 8,
        },
        this.#key,
        plaintext as BufferSource
      )
    )
    const frame = new Uint8Array(HEADER_BYTES + sealed.length)
    frame.set(header, 0)
    frame.set(sealed, HEADER_BYTES)
    return frame
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Opens the frames of one direction and requires the counter to run 0, 1, 2, ... */
export class FrameOpener {
  readonly #key: CryptoKey
  readonly #sid: Uint8Array
  readonly #dir: Direction
  readonly #serial = new Serial()
  #expected = 0n

  constructor(key: CryptoKey, sid: string, dir: Direction = DIR_DAEMON_TO_BROWSER) {
    this.#key = key
    this.#sid = sidToBytes(sid)
    this.#dir = dir
  }

  get nextCounter(): bigint {
    return this.#expected
  }

  /** The plaintext, or a {@link FrameError}. The counter moves only after the tag verified. */
  open(frame: Uint8Array): Promise<Uint8Array> {
    return this.#serial.run(() => this.#openNow(frame))
  }

  #check(frame: Uint8Array): bigint {
    if (frame.length < MIN_FRAME_BYTES) throw new FrameError('malformed', 'frame is too short')
    if (frame.length > MAX_FRAME_BYTES) throw new FrameError('oversize', 'frame is too long')
    if (frame[0] !== FRAME_VERSION) throw new FrameError('version', 'unknown frame version')
    if (!sameBytes(frame.subarray(1, 17), this.#sid)) {
      throw new FrameError('sid', 'frame is for another session')
    }
    if (frame[17] !== this.#dir) {
      throw new FrameError('direction', 'frame has the wrong direction')
    }
    const ctr = new DataView(frame.buffer, frame.byteOffset, frame.length).getBigUint64(18, false)
    if (ctr !== this.#expected) {
      throw new FrameError('counter', 'frame counter is not the next one')
    }
    return ctr
  }

  async #openNow(frame: Uint8Array): Promise<Uint8Array> {
    const ctr = this.#check(frame)
    let plain: ArrayBuffer
    try {
      plain = await globalThis.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonceFor(this.#dir, ctr) as BufferSource,
          additionalData: frame.slice(0, HEADER_BYTES) as BufferSource,
          tagLength: TAG_BYTES * 8,
        },
        this.#key,
        frame.slice(HEADER_BYTES) as BufferSource
      )
    } catch {
      throw new FrameError('tag', 'frame does not authenticate')
    }
    this.#expected += 1n
    return new Uint8Array(plain)
  }
}
