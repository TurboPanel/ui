/**
 * Vocabulary helpers for the CI guard.
 *
 * The TurboPanel daemon is a "daemon" / "host daemon" / "turbopaneld", never
 * an "agent" — that word is reserved for coding-agent tooling (`AGENTS.md`,
 * `.agents/skills`) and unrelated third-party terms (HTTP `User-Agent`, npm
 * package names). Shell chrome is "frosted chrome", never Apple-associated
 * glass product copy. `scripts/check-vocabulary.mjs` walks the tree; this
 * module owns the phrase list, skip/allowlist, and per-file scan.
 *
 * Keep the forbidden-phrase list and allowlist in sync with the sibling
 * checks in `../website/src/lib/vocabulary.ts`,
 * `../turbopaneld/scripts/check-vocabulary.ts`,
 * `../turbopanel/scripts/check-vocabulary.mjs`, and
 * `../.github/scripts/check-vocabulary.sh`.
 */

/** This file necessarily lists the phrases — the walker must not scan it. */
export const VOCABULARY_PHRASE_SOURCE = 'src/lib/vocabulary.ts'

export const FORBIDDEN_PHRASES = [
  'turbopanel agent',
  'node agent',
  'agent host',
  'agent identity',
  'agent commit',
  'server.daemon.projection.agent',
  // Spaced/hyphenated Apple product copy. CamelCase expo-glass-effect
  // identifiers (`isLiquidGlassAvailable`) do not match these phrases.
  'liquid glass',
  'liquid-glass',
  // Machine-brochure marketing vocabulary. TurboPanel copy uses plain words
  // (see website AGENTS.md "Messaging"); stems catch suffixed forms.
  'seamless',
  'effortless',
  'empower',
  'revolutioniz',
  'supercharg',
  'game-chang',
  'next-generation',
  'all-in-one',
] as const

export const ALLOWLIST_LINE_PATTERNS = [
  /user-agent/i,
  /\.agents\/skills/i,
  /^\s*#+\s*agent\b/i,
  /\bcoding[- ]agent\b/i,
  /agent maintenance/i,
  /@scalar\/agent-chat|agent-base|agent-cli-detector|https-proxy-agent/i,
] as const

export const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.expo',
  '.tamagui',
  '.wrangler',
  '.turbo',
  'android',
  'ios',
])

export const SKIP_FILENAMES = new Set([
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'deno.lock',
  'THIRD_PARTY_NOTICES.md',
])

export const GENERATED_TYPE_FILES = new Set([
  'cloudflare-env.d.ts',
  'worker-configuration.d.ts',
])

export const SCAN_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|md|mdx|yml|yaml|sh|json|css)$/

export type VocabularyFailure = Readonly<{
  rel: string
  line: number
  phrase: string
}>

export function isSkippedPath(rel: string, selfRel: string): boolean {
  return (
    rel === selfRel ||
    rel === VOCABULARY_PHRASE_SOURCE ||
    /(^|\/)\.agents\/skills(\/|$)/.test(rel)
  )
}

export function isSkippedDirName(name: string, rel: string, selfRel: string): boolean {
  return SKIP_DIR_NAMES.has(name) || isSkippedPath(rel, selfRel)
}

export function isSkippedFileName(name: string, rel: string, selfRel: string): boolean {
  return (
    SKIP_FILENAMES.has(name) ||
    GENERATED_TYPE_FILES.has(name) ||
    isSkippedPath(rel, selfRel)
  )
}

export function shouldScanFile(file: string): boolean {
  return SCAN_EXTENSIONS.test(file)
}

export function isAllowlisted(line: string): boolean {
  return ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(line))
}

export function scanTextForForbiddenPhrases(
  rel: string,
  text: string,
): VocabularyFailure[] {
  const failures: VocabularyFailure[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (isAllowlisted(line)) continue
    const lower = line.toLowerCase()
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lower.includes(phrase)) {
        failures.push({ rel, line: i + 1, phrase })
      }
    }
  }

  return failures
}

export function formatVocabularyFailure(failure: VocabularyFailure): string {
  return `${failure.rel}:${failure.line} uses forbidden phrase "${failure.phrase}"`
}

/**
 * Warn-mode phrases (not blocking). The terminology page on the website names
 * one word for each part: control plane, app / web app, daemon, server,
 * administrator. These retired words are reported as warnings so new customer
 * copy can be corrected before the list is promoted to FORBIDDEN_PHRASES.
 * Keep in sync with the sibling checks.
 */
export const WARN_PHRASES = [
  { label: 'the console', pattern: /(?<![\w./-])the console(?![\w-])/i },
  { label: 'instance owner', pattern: /\binstance owner\b/i },
  { label: 'Instance CA', pattern: /\bInstance CA\b/ },
  { label: 'hosted instance', pattern: /\bhosted instance\b/i },
  { label: 'remote node', pattern: /\bremote nodes?\b/i },
  { label: 'fleet', pattern: /(?<![\w./'"`-])fleet(?![\w'"`-])(?!\.\w)/i },
] as const

/** Lines where a warn phrase is a real tool or identifier name. */
export const WARN_ALLOWLIST_LINE_PATTERNS = [
  /console\.(log|error|warn|info|debug|table)/,
  /\.\/console|dev console|developer console|dev\/console|\.local\/console/i,
  /^\s*(import|export)\b.*from\b/,
] as const

/** Files that must name the retired words (the glossary itself). */
export const WARN_SKIP_FILENAMES = new Set(['terminology.mdx'])

export function scanTextForWarnings(rel: string, text: string): VocabularyFailure[] {
  const base = rel.split('/').pop() ?? rel
  if (WARN_SKIP_FILENAMES.has(base)) return []
  const warnings: VocabularyFailure[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (WARN_ALLOWLIST_LINE_PATTERNS.some((pattern) => pattern.test(line))) continue
    for (const { label, pattern } of WARN_PHRASES) {
      if (pattern.test(line)) warnings.push({ rel, line: i + 1, phrase: label })
    }
  }
  return warnings
}

export function formatVocabularyWarning(warning: VocabularyFailure): string {
  return `${warning.rel}:${warning.line} says "${warning.phrase}" (see the terminology page)`
}
