import { describe, expect, it } from 'vitest'
import {
  FORBIDDEN_PHRASES,
  formatVocabularyFailure,
  GENERATED_TYPE_FILES,
  isAllowlisted,
  isSkippedDirName,
  isSkippedFileName,
  isSkippedPath,
  scanTextForForbiddenPhrases,
  shouldScanFile,
  SKIP_DIR_NAMES,
  SKIP_FILENAMES,
  VOCABULARY_PHRASE_SOURCE,
} from '@/lib/vocabulary'

const SELF = 'scripts/check-vocabulary.mjs'

describe('isSkippedPath', () => {
  it('skips the walker script and the phrase-source module', () => {
    expect(isSkippedPath(SELF, SELF)).toBe(true)
    expect(isSkippedPath(VOCABULARY_PHRASE_SOURCE, SELF)).toBe(true)
    expect(isSkippedPath('src/lib/theme.ts', SELF)).toBe(false)
  })

  it('skips installed agent-skill packs at any depth', () => {
    expect(isSkippedPath('.agents/skills', SELF)).toBe(true)
    expect(isSkippedPath('.agents/skills/ui-ux-pro-max/SKILL.md', SELF)).toBe(true)
    expect(isSkippedPath('vendor/.agents/skills/pack/x.ts', SELF)).toBe(true)
    expect(isSkippedPath('.agents/other/file.ts', SELF)).toBe(false)
  })
})

describe('isSkippedDirName', () => {
  it('skips known generated and vendor directories', () => {
    for (const name of SKIP_DIR_NAMES) {
      expect(isSkippedDirName(name, name, SELF)).toBe(true)
    }
    expect(isSkippedDirName('src', 'src', SELF)).toBe(false)
    expect(isSkippedDirName('skills', '.agents/skills', SELF)).toBe(true)
  })
})

describe('isSkippedFileName', () => {
  it('skips lockfiles and generated type declarations', () => {
    for (const name of SKIP_FILENAMES) {
      expect(isSkippedFileName(name, name, SELF)).toBe(true)
    }
    for (const name of GENERATED_TYPE_FILES) {
      expect(isSkippedFileName(name, name, SELF)).toBe(true)
    }
    expect(isSkippedFileName('vocabulary.ts', VOCABULARY_PHRASE_SOURCE, SELF)).toBe(true)
    expect(isSkippedFileName('AGENTS.md', 'AGENTS.md', SELF)).toBe(false)
  })
})

describe('shouldScanFile', () => {
  it('matches hand-authored source and docs extensions', () => {
    expect(shouldScanFile('src/lib/vocabulary.ts')).toBe(true)
    expect(shouldScanFile('scripts/check-vocabulary.mjs')).toBe(true)
    expect(shouldScanFile('src/app/_layout.tsx')).toBe(true)
    expect(shouldScanFile('src/lib/env.js')).toBe(true)
    expect(shouldScanFile('src/components/Logo.jsx')).toBe(true)
    expect(shouldScanFile('scripts/legacy.cjs')).toBe(true)
    expect(shouldScanFile('AGENTS.md')).toBe(true)
    expect(shouldScanFile('design-system/turbopanel/MASTER.md')).toBe(true)
    expect(shouldScanFile('.github/workflows/verify.yml')).toBe(true)
    expect(shouldScanFile('package.json')).toBe(true)
    expect(shouldScanFile('scripts/ensure-git-hooks.sh')).toBe(true)
    expect(shouldScanFile('src/lib/theme.css')).toBe(true)
    expect(shouldScanFile('wrangler.jsonc')).toBe(false)
    expect(shouldScanFile('assets/brand/turbopanel-logo.svg')).toBe(false)
  })
})

describe('isAllowlisted', () => {
  it('allows HTTP User-Agent, skill packs, and coding-agent policy copy', () => {
    expect(isAllowlisted('User-Agent: curl/8.0')).toBe(true)
    expect(isAllowlisted('See .agents/skills/ui-ux-pro-max')).toBe(true)
    expect(isAllowlisted('### Agent policy')).toBe(true)
    expect(isAllowlisted('coding-agent tooling lives under AGENTS.md')).toBe(true)
    expect(isAllowlisted('coding agent maintenance notes')).toBe(true)
    expect(isAllowlisted('Keep agent maintenance docs current.')).toBe(true)
    expect(isAllowlisted('depends on https-proxy-agent')).toBe(true)
    expect(isAllowlisted('import "@scalar/agent-chat"')).toBe(true)
    expect(isAllowlisted('agent-cli-detector')).toBe(true)
    expect(isAllowlisted('Plain daemon copy')).toBe(false)
  })
})

describe('scanTextForForbiddenPhrases', () => {
  it('flags every forbidden phrase and reports 1-based lines', () => {
    for (const phrase of FORBIDDEN_PHRASES) {
      const failures = scanTextForForbiddenPhrases(
        'docs/example.md',
        `intro\nThe ${phrase} must not ship.\n`,
      )
      if (failures.length !== 1) {
        throw new TypeError(`expected one failure for ${phrase}`)
      }
      expect(failures[0]).toEqual({
        rel: 'docs/example.md',
        line: 2,
        phrase,
      })
    }
  })

  it('is case-insensitive and can report several phrases on one line', () => {
    const [first, second] = FORBIDDEN_PHRASES
    const failures = scanTextForForbiddenPhrases(
      'src/copy.ts',
      `${first.toUpperCase()} and ${second}`,
    )
    expect(failures.map((row) => row.phrase).sort((a, b) => a.localeCompare(b))).toEqual(
      [first, second].sort((a, b) => a.localeCompare(b)),
    )
  })

  it('does not flag allowlisted lines that contain a forbidden substring', () => {
    const phrase = FORBIDDEN_PHRASES[0]
    expect(
      scanTextForForbiddenPhrases('AGENTS.md', `User-Agent docs mention ${phrase}`),
    ).toEqual([])
  })

  it('does not flag camelCase expo-glass-effect identifiers', () => {
    expect(
      scanTextForForbiddenPhrases(
        'src/components/glass/glass-surface.tsx',
        'return isLiquidGlassAvailable() && isGlassEffectAPIAvailable()',
      ),
    ).toEqual([])
  })
})

describe('formatVocabularyFailure', () => {
  it('renders the CLI failure line', () => {
    expect(
      formatVocabularyFailure({
        rel: 'docs/x.md',
        line: 4,
        phrase: FORBIDDEN_PHRASES[0],
      }),
    ).toBe(
      `docs/x.md:4 uses forbidden phrase "${FORBIDDEN_PHRASES[0]}"`,
    )
  })
})
