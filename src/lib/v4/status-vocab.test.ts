import { describe, expect, it } from 'vitest'
import {
  compactPendingLabel,
  GLYPHS,
  isStatusKey,
  pendingSummary,
  rectGeometry,
  STATUS,
  statusInfo,
  TONE_RANK,
  worstStatus,
  type GlyphKey,
} from '@/lib/v4/status-vocab'

describe('status vocabulary', () => {
  it('gives every status a word, a drawn glyph and a tone', () => {
    for (const [key, info] of Object.entries(STATUS)) {
      expect(info.label, key).toMatch(/\S/)
      expect(GLYPHS[info.glyph as GlyphKey]?.length, key).toBeGreaterThan(0)
      expect(Object.keys(TONE_RANK)).toContain(info.tone)
    }
  })

  it('reads the words people expect', () => {
    expect(statusInfo('running')).toMatchObject({ label: 'Running', tone: 'ok' })
    expect(statusInfo('crashstop').label).toBe('Stopped after 10 crashes')
    expect(statusInfo('unhealthy')).toMatchObject({ label: 'Not healthy', tone: 'warn' })
    expect(statusInfo('changes')).toMatchObject({ label: 'Not deployed', tone: 'warn' })
    expect(statusInfo('ok').label).toBe('Secure')
    expect(statusInfo('failed').tone).toBe('bad')
    expect(statusInfo('deploying').tone).toBe('busy')
  })

  it('keeps green for running and live things only', () => {
    const green = Object.entries(STATUS)
      .filter(([, info]) => info.tone === 'ok')
      .map(([key]) => key)
      .sort()
    expect(green).toEqual(['deployed', 'live', 'ok', 'online', 'ready', 'running'])
  })

  it('never leaves status to colour: shapes differ between tones that could be confused', () => {
    // Red and amber states use shapes no green state uses.
    const greenShapes = new Set<string>(
      Object.values(STATUS).filter((i) => i.tone === 'ok').map((i) => i.glyph),
    )
    for (const info of Object.values(STATUS)) {
      if (info.tone === 'bad' || info.tone === 'warn') {
        expect(greenShapes.has(info.glyph), info.label).toBe(false)
      }
    }
  })

  it('reads an unknown key as Unknown', () => {
    expect(isStatusKey('running')).toBe(true)
    expect(isStatusKey('nonsense')).toBe(false)
    expect(isStatusKey('toString')).toBe(false)
    expect(statusInfo('nonsense')).toBe(STATUS.unknown)
  })

  it('picks the worst status for one dot', () => {
    expect(worstStatus(['running', 'failed', 'stopped'])).toBe('failed')
    expect(worstStatus(['running', 'rolledback'])).toBe('rolledback')
    expect(worstStatus(['running', 'deploying'])).toBe('deploying')
    expect(worstStatus(['stopped', 'running'])).toBe('stopped')
    expect(worstStatus(['running', 'deployed'])).toBe('running')
    expect(worstStatus([])).toBe('unknown')
  })

  it('words the pending texts', () => {
    expect(compactPendingLabel(2)).toBe('2 not deployed')
    expect(pendingSummary(1, 'Staging')).toBe('1 change · Saved. Goes live when you deploy Staging.')
    expect(pendingSummary(3, 'Staging')).toContain('3 changes')
  })

  it('places the rect glyphs', () => {
    expect(rectGeometry('square')).toEqual({ x: 5, y: 5, w: 14, h: 14 })
    expect(rectGeometry('lock')).toEqual({ x: 4, y: 10, w: 16, h: 12 })
    expect(rectGeometry('unlock')).toEqual(rectGeometry('lock'))
  })
})
