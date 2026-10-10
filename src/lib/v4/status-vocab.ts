/**
 * v4 status words, tones and glyph shapes.
 *
 * Status is never colour alone: every key carries a word, a glyph and a tone.
 * One colour job per tone: green is running or live only, violet is in
 * progress, amber is not deployed or a warning, red is failed or crashed,
 * grey is idle. The keys, words and shapes follow the design spec
 * (`theme-v4.css` status block); screens turn their data into a key and never
 * write the word themselves.
 */

import { plural } from './text'

export type StatusTone = 'ok' | 'busy' | 'warn' | 'bad' | 'idle'

export type GlyphKey =
  | 'dot'
  | 'ring'
  | 'thin'
  | 'dashed'
  | 'dotted'
  | 'spinner'
  | 'triangle'
  | 'diamond'
  | 'octagon'
  | 'square'
  | 'half'
  | 'undo'
  | 'lock'
  | 'unlock'
  | 'clock'

export type StatusInfo = Readonly<{
  label: string
  glyph: GlyphKey
  tone: StatusTone
}>

/** Keys group by what they describe; the words are the ones people read. */
export const STATUS = {
  // What is running now
  running: { label: 'Running', glyph: 'dot', tone: 'ok' },
  busy: { label: 'Starting', glyph: 'spinner', tone: 'busy' },
  unhealthy: { label: 'Not healthy', glyph: 'triangle', tone: 'warn' },
  crashing: { label: 'Keeps crashing', glyph: 'triangle', tone: 'bad' },
  crashstop: { label: 'Stopped after 10 crashes', glyph: 'octagon', tone: 'bad' },
  stopped: { label: 'Stopped', glyph: 'ring', tone: 'idle' },
  never: { label: 'Not deployed yet', glyph: 'thin', tone: 'idle' },
  unknown: { label: 'Unknown', glyph: 'dashed', tone: 'idle' },
  // The last deploy
  deployed: { label: 'Deployed', glyph: 'dot', tone: 'ok' },
  live: { label: 'Live', glyph: 'dot', tone: 'ok' },
  settling: { label: 'Live · settling', glyph: 'spinner', tone: 'busy' },
  deploying: { label: 'Deploying', glyph: 'spinner', tone: 'busy' },
  building: { label: 'Building', glyph: 'spinner', tone: 'busy' },
  queued: { label: 'Waiting to start', glyph: 'dotted', tone: 'busy' },
  failed: { label: 'Deploy failed', glyph: 'diamond', tone: 'bad' },
  rolledback: { label: 'Rolled back', glyph: 'undo', tone: 'warn' },
  autorolledback: { label: 'Rolled back automatically', glyph: 'undo', tone: 'warn' },
  livecrashed: { label: 'Live, then crashed', glyph: 'triangle', tone: 'bad' },
  cancelled: { label: 'Cancelled', glyph: 'square', tone: 'idle' },
  // Saved but not deployed
  changes: { label: 'Not deployed', glyph: 'half', tone: 'warn' },
  // Domains and certificates
  waiting: { label: 'Waiting for DNS', glyph: 'dotted', tone: 'busy' },
  issuing: { label: 'Getting certificate', glyph: 'spinner', tone: 'busy' },
  ok: { label: 'Secure', glyph: 'lock', tone: 'ok' },
  expiring: { label: 'Expires soon', glyph: 'clock', tone: 'warn' },
  renewal_failed: { label: 'Renewal failed', glyph: 'diamond', tone: 'bad' },
  test: { label: 'Test certificate (browsers warn)', glyph: 'unlock', tone: 'warn' },
  // Servers and databases
  online: { label: 'Online', glyph: 'dot', tone: 'ok' },
  offline: { label: 'Offline', glyph: 'diamond', tone: 'bad' },
  ready: { label: 'Ready', glyph: 'dot', tone: 'ok' },
} as const satisfies Record<string, StatusInfo>

export type StatusKey = keyof typeof STATUS

export function isStatusKey(key: string): key is StatusKey {
  return Object.hasOwn(STATUS, key)
}

/** The word, glyph and tone for a key; an unrecognised key reads "Unknown". */
export function statusInfo(key: string): StatusInfo {
  return isStatusKey(key) ? STATUS[key] : STATUS.unknown
}

/** Which tone wins when several statuses share one dot: red, amber, violet, grey, green. */
export const TONE_RANK: Readonly<Record<StatusTone, number>> = {
  bad: 5,
  warn: 4,
  busy: 3,
  idle: 2,
  ok: 1,
}

/**
 * The status to show on one dot for several keys: the highest-ranked tone, the
 * first of equal rank. Returns `unknown` for an empty list.
 */
export function worstStatus(keys: readonly string[]): string {
  let worst = 'unknown'
  let rank = 0
  for (const key of keys) {
    const next = TONE_RANK[statusInfo(key).tone]
    if (next > rank) {
      rank = next
      worst = key
    }
  }
  return worst
}

/** Label of the compact "not deployed" chip: "2 not deployed". */
export function compactPendingLabel(count: number): string {
  return `${count} not deployed`
}

/** "3 changes · Saved. Goes live when you deploy Staging." */
export function pendingSummary(count: number, envName: string): string {
  return `${plural(count, 'change')} · Saved. Goes live when you deploy ${envName}.`
}

// --- Glyph shapes (24 x 24 box) ---------------------------------------------

type ShapePaint = Readonly<{
  paint: 'fill' | 'stroke'
  /** Stroke width; fills leave it out. */
  width?: number
  round?: boolean
  dash?: string
}>

export type GlyphShape =
  | (ShapePaint & Readonly<{ kind: 'circle'; r: number }>)
  | (ShapePaint & Readonly<{ kind: 'path'; d: string }>)
  | (ShapePaint & Readonly<{ kind: 'rect'; rx: number }>)

const CIRCLE_R = 12

export const GLYPHS: Readonly<Record<GlyphKey, readonly GlyphShape[]>> = {
  dot: [{ kind: 'circle', r: 6.5, paint: 'fill' }],
  ring: [{ kind: 'circle', r: 7, paint: 'stroke', width: 3.2 }],
  thin: [{ kind: 'circle', r: 7.5, paint: 'stroke', width: 2 }],
  dashed: [{ kind: 'circle', r: 8, paint: 'stroke', width: 2.6, dash: '4 3' }],
  dotted: [{ kind: 'circle', r: 8, paint: 'stroke', width: 3.2, round: true, dash: '0.1 5' }],
  spinner: [{ kind: 'path', d: 'M12 3.5a8.5 8.5 0 1 1-8.5 8.5', paint: 'stroke', width: 3.2, round: true }],
  triangle: [{ kind: 'path', d: 'M12 2.5 22.5 20.5h-21Z', paint: 'fill' }],
  diamond: [{ kind: 'path', d: 'M12 2 22 12 12 22 2 12Z', paint: 'fill' }],
  octagon: [{ kind: 'path', d: 'M8 2h8l6 6v8l-6 6H8l-6-6V8Z', paint: 'fill' }],
  square: [{ kind: 'rect', rx: 2.5, paint: 'fill' }],
  half: [
    { kind: 'circle', r: 8, paint: 'stroke', width: 2.6 },
    { kind: 'path', d: 'M12 4a8 8 0 0 1 0 16Z', paint: 'fill' },
  ],
  undo: [
    {
      kind: 'path',
      d: 'M9 15 4 10l5-5M4 10h10.5a5.5 5.5 0 0 1 0 11H11',
      paint: 'stroke',
      width: 3,
      round: true,
    },
  ],
  lock: [
    { kind: 'rect', rx: 2.5, paint: 'fill' },
    { kind: 'path', d: 'M8 10.5V7a4 4 0 0 1 8 0v3.5', paint: 'stroke', width: 2.6 },
  ],
  unlock: [
    { kind: 'rect', rx: 2.5, paint: 'fill' },
    { kind: 'path', d: 'M8 10.5V7a4 4 0 0 1 7.6-1.7', paint: 'stroke', width: 2.6, round: true },
  ],
  clock: [
    { kind: 'circle', r: 8.5, paint: 'stroke', width: 2.6 },
    { kind: 'path', d: 'M12 7.5V12l3 2', paint: 'stroke', width: 2.6, round: true },
  ],
}

/** Centre of every circle glyph in the 24 x 24 box. */
export const GLYPH_CENTER = CIRCLE_R

/**
 * Where a rect shape sits. The square is a plain 14 x 14 block; the lock and
 * the unlock body is a 16 x 12 block under the shackle.
 */
export function rectGeometry(glyph: GlyphKey): Readonly<{ x: number; y: number; w: number; h: number }> {
  return glyph === 'square'
    ? { x: 5, y: 5, w: 14, h: 14 }
    : { x: 4, y: 10, w: 16, h: 12 }
}
