import { describe, expect, it } from 'vitest'
import { base64urlToBytes, bytesToBase64url } from './base64url'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

/** A real `ArrayBuffer`, not the `ArrayBufferLike` a view's `.buffer` is typed as. */
function buffer(...values: number[]): ArrayBuffer {
  const out = new ArrayBuffer(values.length)
  new Uint8Array(out).set(values)
  return out
}

describe('bytesToBase64url', () => {
  it('encodes without padding', () => {
    expect(bytesToBase64url(bytes(0x66, 0x6f, 0x6f))).toBe('Zm9v')
  })

  it('encodes a one-byte remainder', () => {
    expect(bytesToBase64url(bytes(0x66))).toBe('Zg')
  })

  it('encodes a two-byte remainder', () => {
    expect(bytesToBase64url(bytes(0x66, 0x6f))).toBe('Zm8')
  })

  it('uses the url alphabet rather than + and /', () => {
    // 0xfb 0xff produces `+/` in standard base64.
    expect(bytesToBase64url(bytes(0xfb, 0xff, 0xbf))).toBe('-_-_')
  })

  it('accepts an ArrayBuffer', () => {
    expect(bytesToBase64url(buffer(0x66, 0x6f, 0x6f))).toBe('Zm9v')
  })

  it('encodes an empty input as an empty string', () => {
    expect(bytesToBase64url(bytes())).toBe('')
  })
})

describe('base64urlToBytes', () => {
  it('decodes the url alphabet', () => {
    expect([...base64urlToBytes('Zm9v')]).toEqual([0x66, 0x6f, 0x6f])
  })

  it('tolerates padding', () => {
    expect([...base64urlToBytes('Zg==')]).toEqual([0x66])
  })

  it('accepts standard base64 characters', () => {
    expect([...base64urlToBytes('-_-_')]).toEqual(
      [...base64urlToBytes('+/+/')],
    )
  })

  it('rejects a character outside the alphabet', () => {
    expect(() => base64urlToBytes('Zm9v!')).toThrow(TypeError)
  })

  it('decodes an empty string to no bytes', () => {
    expect(base64urlToBytes('')).toHaveLength(0)
  })
})

describe('round trip', () => {
  it('survives every byte value', () => {
    const all = new Uint8Array(256)
    for (let index = 0; index < 256; index += 1) all[index] = index
    expect([...base64urlToBytes(bytesToBase64url(all))]).toEqual([...all])
  })

  it('survives each remainder length', () => {
    for (const length of [1, 2, 3, 4, 5]) {
      const input = new Uint8Array(length).fill(0x2a)
      expect([...base64urlToBytes(bytesToBase64url(input))]).toEqual([...input])
    }
  })
})
