import { describe, expect, it } from 'vitest'
import { FrameOpener, FrameSealer, importSessionKey } from '@/lib/terminal/crypto'
import {
  CLOSE_REASONS,
  FrameError,
  closeReasonName,
  decodePlain,
  encodeAck,
  encodeClose,
  encodeData,
  encodeExit,
  encodeNotice,
  encodeResize,
  hexToBytes,
  isSid,
  sidToBytes,
  type Direction,
} from '@/lib/terminal/frames'
import vectors from '@/lib/terminal/frames.vectors.json'

const CODES = new Set(['malformed', 'version', 'sid', 'direction', 'counter', 'tag', 'oversize'])
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const key = () => importSessionKey(hexToBytes(vectors.keyHex))

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof FrameError) return error.code
    throw error
  }
  return 'none'
}

describe('shared frame vectors', () => {
  it('seals to and opens every vector frame', async () => {
    for (const dir of [0, 1] as Direction[]) {
      const sealer = new FrameSealer(await key(), vectors.sid, dir)
      const opener = new FrameOpener(await key(), vectors.sid, dir)
      for (const v of vectors.frames.filter((f) => f.dir === dir)) {
        expect(toHex(await sealer.seal(hexToBytes(v.plaintextHex)))).toBe(v.frameHex)
        expect(toHex(await opener.open(hexToBytes(v.frameHex)))).toBe(v.plaintextHex)
      }
    }
  })

  it('gives the shared outcome for every frame of every sequence', async () => {
    for (const seq of vectors.sequences) {
      const opener = new FrameOpener(await key(), vectors.sid, seq.dir as Direction)
      for (const [i, hex] of seq.frames.entries()) {
        const want = seq.expect[i]
        if (CODES.has(want)) {
          expect(await codeOf(opener.open(hexToBytes(hex)))).toBe(want)
        } else {
          expect(toHex(await opener.open(hexToBytes(hex)))).toBe(want)
        }
      }
    }
  })
})

describe('opener counter rules', () => {
  it('rejects a skipped counter, a replay and a bad tag without moving', async () => {
    const k = await key()
    const sealer = new FrameSealer(k, vectors.sid, 1)
    const opener = new FrameOpener(k, vectors.sid, 1)
    const f0 = await sealer.seal(encodeData(Uint8Array.of(1)))
    const f1 = await sealer.seal(encodeData(Uint8Array.of(2)))
    const f2 = await sealer.seal(encodeData(Uint8Array.of(3)))
    expect(await codeOf(opener.open(f1))).toBe('counter')
    expect(opener.nextCounter).toBe(0n)
    await opener.open(f0)
    expect(await codeOf(opener.open(f0))).toBe('counter')
    const tampered = f1.slice()
    tampered[tampered.length - 1] ^= 1
    expect(await codeOf(opener.open(tampered))).toBe('tag')
    expect(opener.nextCounter).toBe(1n)
    await opener.open(f1)
    await opener.open(f2)
    expect(opener.nextCounter).toBe(3n)
  })

  it('keeps call order when several opens and seals are pending', async () => {
    const k = await key()
    const sealer = new FrameSealer(k, vectors.sid, 1)
    const opener = new FrameOpener(k, vectors.sid, 1)
    const frames = await Promise.all(
      [1, 2, 3, 4].map((n) => sealer.seal(encodeData(Uint8Array.of(n))))
    )
    const plains = await Promise.all(frames.map((f) => opener.open(f)))
    expect(plains.map((p) => p[1])).toEqual([1, 2, 3, 4])
    expect(sealer.nextCounter).toBe(4n)
  })

  it('rejects short, long, wrong-version, wrong-session and wrong-direction frames', async () => {
    const k = await key()
    const sealer = new FrameSealer(k, vectors.sid, 1)
    const frame = await sealer.seal(encodeData(Uint8Array.of(1)))
    const opener = () => new FrameOpener(k, vectors.sid, 1)
    expect(await codeOf(opener().open(frame.slice(0, 20)))).toBe('malformed')
    expect(await codeOf(opener().open(new Uint8Array(70000 + 100)))).toBe('oversize')
    const version = frame.slice()
    version[0] = 2
    expect(await codeOf(opener().open(version))).toBe('version')
    const sid = frame.slice()
    sid[1] ^= 1
    expect(await codeOf(opener().open(sid))).toBe('sid')
    expect(await codeOf(new FrameOpener(k, vectors.sid, 0).open(frame))).toBe('direction')
  })
})

describe('sealer limits and the key', () => {
  it('refuses an empty or oversize plaintext and a short key', async () => {
    const sealer = new FrameSealer(await key(), vectors.sid)
    expect(await codeOf(sealer.seal(new Uint8Array(0)))).toBe('oversize')
    expect(await codeOf(sealer.seal(new Uint8Array(64 * 1024 + 1)))).toBe('oversize')
    // A refused plaintext does not use up a counter.
    expect(sealer.nextCounter).toBe(0n)
    expect(() => importSessionKey(new Uint8Array(16))).toThrow(FrameError)
  })
})

describe('plaintext messages', () => {
  it('round-trips every type', () => {
    expect(decodePlain(encodeData(Uint8Array.of(7, 8)))).toEqual({
      type: 'data',
      data: Uint8Array.of(7, 8),
    })
    expect(decodePlain(encodeResize(120, 40))).toEqual({ type: 'resize', cols: 120, rows: 40 })
    expect(decodePlain(encodeAck(32768))).toEqual({ type: 'ack', bytes: 32768 })
    expect(decodePlain(encodeClose(CLOSE_REASONS.idle))).toEqual({ type: 'close', reason: 1 })
    expect(decodePlain(encodeExit(-1))).toEqual({ type: 'exit', code: -1 })
    expect(decodePlain(encodeNotice('héllo'))).toEqual({ type: 'notice', text: 'héllo' })
  })

  it('rejects empty, unknown, short and non-UTF-8 plaintext', () => {
    const code = (fn: () => unknown) => {
      try {
        fn()
      } catch (error) {
        return (error as FrameError).code
      }
      return 'none'
    }
    expect(code(() => decodePlain(new Uint8Array(0)))).toBe('plaintext')
    expect(code(() => decodePlain(Uint8Array.of(9)))).toBe('plaintext')
    for (const type of [2, 3, 4, 5])
      expect(code(() => decodePlain(Uint8Array.of(type)))).toBe('plaintext')
    expect(code(() => decodePlain(Uint8Array.of(6, 0xff)))).toBe('plaintext')
  })

  it('names close reasons and validates session ids', () => {
    expect(closeReasonName(0)).toBe('exit')
    expect(closeReasonName(6)).toBe('daemon-restart')
    expect(closeReasonName(99)).toBe('error')
    expect(isSid(vectors.sid)).toBe(true)
    expect(isSid('nope')).toBe(false)
    expect(isSid(5)).toBe(false)
    expect(() => sidToBytes('nope')).toThrow(FrameError)
    expect(sidToBytes(vectors.sid)[0]).toBe(0x6f)
  })
})
