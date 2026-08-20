export const EXPO_START_DEFAULT_ORIGIN = 'https://localhost:8443'
export const EXPO_START_ENV_KEY = 'EXPO_PUBLIC_CONTROL_PLANE_URL'

export function shouldPromptForControlPlane(input: Readonly<{
  controlPlaneUrl?: string
  skipPrompt?: string
  ci?: string
  isTty: boolean
}>): boolean {
  if (input.skipPrompt === '1') return false
  if (input.controlPlaneUrl?.trim()) return false
  if (input.ci === 'true' || input.ci === '1') return false
  return input.isTty
}

export function parseExpoStartOrigin(
  raw: string,
  fallback = EXPO_START_DEFAULT_ORIGIN,
): { ok: true; origin: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, origin: fallback }
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'URL must start with http:// or https://' }
    }
    return { ok: true, origin: parsed.origin }
  } catch {
    return { ok: false, error: 'Enter a valid http(s) URL' }
  }
}

export function upsertControlPlaneEnvLine(
  existing: string,
  origin: string,
  key = EXPO_START_ENV_KEY,
): string {
  const line = `${key}=${origin}`
  const lines = existing.split('\n')
  let replaced = false
  const next = lines.map((entry) => {
    if (entry.startsWith(`${key}=`)) {
      replaced = true
      return line
    }
    return entry
  })
  if (!replaced) {
    if (next.length === 1 && next[0] === '') {
      return `${line}\n`
    }
    if (next.length > 0 && next.at(-1) !== '') {
      next.push('')
    }
    next.push(line)
  }
  return `${trimTrailingNewlines(next.join('\n'))}\n`
}

function trimTrailingNewlines(text: string): string {
  let end = text.length
  while (end > 0 && text.codePointAt(end - 1) === 10) {
    end -= 1
  }
  return text.slice(0, end)
}
