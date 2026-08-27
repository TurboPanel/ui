#!/usr/bin/env node
/**
 * Vocabulary check (CI guard).
 *
 * Scans human-authored source, design-system docs, and maintainer docs for
 * forbidden daemon-as-agent phrasing and Apple-associated glass product copy.
 * Phrase list, skip/allowlist, and per-file scan live in `src/lib/vocabulary.ts`.
 *
 * Usage:
 *   node scripts/check-vocabulary.mjs
 *   pnpm check:vocabulary
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  formatVocabularyFailure,
  isSkippedDirName,
  isSkippedFileName,
  scanTextForForbiddenPhrases,
  shouldScanFile,
} from '../src/lib/vocabulary.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url))

export function* walk(dir, root = ROOT, selfRel = SELF) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    const rel = path.relative(root, abs)
    if (entry.isDirectory()) {
      if (isSkippedDirName(entry.name, rel, selfRel)) continue
      yield* walk(abs, root, selfRel)
    } else if (entry.isFile() && !isSkippedFileName(entry.name, rel, selfRel)) {
      yield abs
    }
  }
}

/**
 * @typedef {{
 *   log: (...args: unknown[]) => void,
 *   error: (...args: unknown[]) => void,
 * }} VocabularyCheckIo
 */

/**
 * @param {{
 *   root?: string,
 *   selfRel?: string,
 *   io?: VocabularyCheckIo,
 *   exit?: (code: number) => void,
 * }} [options]
 * @returns {0 | 1}
 */
export function runVocabularyCheck({
  root = ROOT,
  selfRel = SELF,
  io = console,
  exit,
} = {}) {
  const failures = []

  for (const file of walk(root, root, selfRel)) {
    if (!shouldScanFile(file)) continue
    const rel = path.relative(root, file)
    const text = fs.readFileSync(file, 'utf8')
    for (const failure of scanTextForForbiddenPhrases(rel, text)) {
      failures.push(formatVocabularyFailure(failure))
    }
  }

  if (failures.length > 0) {
    io.error('Vocabulary check failed:\n')
    for (const failure of failures) {
      io.error(`  \u2717 ${failure}`)
    }
    io.error(
      `\n${failures.length} problem(s) found. The TurboPanel daemon is a "daemon" / "host daemon" / "turbopaneld", never an "agent". ` +
        'Shell chrome is "frosted chrome", never Apple-associated glass product copy. ' +
        'Update the allowlist in src/lib/vocabulary.ts (and the sibling repo copies) if this is a legitimate coding-agent, third-party, or expo-glass-effect identifier.',
    )
    const leave = exit ?? ((code) => process.exit(code))
    leave(1)
    return 1
  }

  io.log('check-vocabulary: no forbidden phrasing found.')
  return 0
}

export function isExecutedAsCli(metaUrl = import.meta.url, argv1 = process.argv[1]) {
  return Boolean(argv1) && metaUrl === pathToFileURL(path.resolve(argv1)).href
}

if (isExecutedAsCli()) {
  runVocabularyCheck()
}
