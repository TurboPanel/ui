/**
 * The time shown beside a log line: `12:04:37.218`, local time. Logs are read
 * while watching, not audited by date, and the milliseconds show the gaps
 * between lines printed in the same second. Fixed width, so a monospace column
 * stays aligned.
 */
export function formatLogLineTime(timestamp: string | null): string | null {
  if (!timestamp) return null
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return null
  const hours = String(parsed.getHours()).padStart(2, '0')
  const minutes = String(parsed.getMinutes()).padStart(2, '0')
  const seconds = String(parsed.getSeconds()).padStart(2, '0')
  const millis = String(parsed.getMilliseconds()).padStart(3, '0')
  return `${hours}:${minutes}:${seconds}.${millis}`
}
