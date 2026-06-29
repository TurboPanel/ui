export type FormatLocalDateTimeOptions = {
  /** Show calendar date. Default true. */
  includeDate?: boolean
  /** Show seconds. Default true. */
  includeSeconds?: boolean
  /** IANA zone override; default is the runtime local zone. */
  timeZone?: string
  /** How to render the zone label. Default `short` (e.g. PDT). */
  timeZoneName?: 'short' | 'long'
  /** Returned when the input is missing or not parseable. Default `—`. */
  fallback?: string
}

function parseTimestamp(
  value: Date | string | number | null | undefined,
): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Format an instant in the user's local timezone, including a zone label.
 * Pass `undefined` as locale so Intl uses the device/browser default.
 */
export function formatLocalDateTime(
  value: Date | string | number | null | undefined,
  options: FormatLocalDateTimeOptions = {},
): string {
  const {
    includeDate = true,
    includeSeconds = true,
    timeZone,
    timeZoneName = 'short',
    fallback = '—',
  } = options

  const date = parseTimestamp(value)
  if (!date) return fallback

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    second: includeSeconds ? '2-digit' : undefined,
    timeZoneName,
  }

  if (includeDate) {
    formatOptions.year = 'numeric'
    formatOptions.month = 'short'
    formatOptions.day = 'numeric'
  }

  if (timeZone) {
    formatOptions.timeZone = timeZone
  }

  return new Intl.DateTimeFormat(undefined, formatOptions).format(date)
}

export type FormatRelativeLocalDateTimeOptions = {
  fallback?: string
  neverLabel?: string
  /** Passed through to {@link formatLocalDateTime} for the absolute suffix. */
  absolute?: Omit<FormatLocalDateTimeOptions, 'fallback'>
}

/**
 * Relative age (e.g. `5m ago`) with the absolute local timestamp in parentheses.
 */
export function formatRelativeLocalDateTime(
  value: Date | string | number | null | undefined,
  options: FormatRelativeLocalDateTimeOptions = {},
): string {
  const {
    fallback = 'Unknown',
    neverLabel = 'Never',
    absolute,
  } = options

  const date = parseTimestamp(value)
  if (!date) return neverLabel

  const absoluteLabel = formatLocalDateTime(date, absolute)
  const deltaMs = Date.now() - date.getTime()
  if (deltaMs < 0) return absoluteLabel

  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 60) return `${seconds}s ago (${absoluteLabel})`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago (${absoluteLabel})`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago (${absoluteLabel})`

  const days = Math.floor(hours / 24)
  return `${days}d ago (${absoluteLabel})`
}

/**
 * Elapsed time since an instant (e.g. uptime). Does not include a zone label.
 */
export function formatElapsedSince(
  value: Date | string | number | null | undefined,
  options: { fallback?: string; justNowLabel?: string } = {},
): string {
  const { fallback = 'Unknown', justNowLabel = 'Just now' } = options

  const date = parseTimestamp(value)
  if (!date) return fallback

  const deltaMs = Date.now() - date.getTime()
  if (deltaMs < 0) return justNowLabel

  const seconds = Math.floor(deltaMs / 1000)
  if (seconds < 60) return `${seconds}s`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`

  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}
