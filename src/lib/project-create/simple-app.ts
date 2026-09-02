/**
 * What the wizard can learn about a repository's app before it exists.
 *
 * Pure functions over the inspection payload (`GET /repositories/:id/inspect`),
 * so the repository step can show "Node app · pnpm" and prefill build/start
 * commands **before** anything is created. The daemon re-detects the package
 * manager from the lockfile at build time (`turbopaneld` release build), so
 * nothing here is authoritative — it only has to agree with that detection,
 * which is why the lockfile precedence below mirrors the daemon's.
 */

import type { NodePackageManager } from '@/lib/compose/service-kind'
import type { RepositoryInspection, RepositoryProbedFile } from '@/lib/instance-api'
import { rootFromEntries } from '@/lib/compose/repository-lane'

/** Builder card picked on the repository screen. */
export type RepositoryBuilder = 'simple' | 'railpack' | 'compose' | 'site-php'

/** What a Simple application produces: a supervised process, or built files. */
export type SimpleAppKind = 'web' | 'static'

/**
 * Everything the Simple application form collects. Command strings are the
 * operator's text verbatim; empty means "platform default" (the daemon derives
 * the install command itself and falls back to `server.js` for the start).
 */
export type SimpleAppConfig = {
  kind: SimpleAppKind
  /** Directory the build runs in, relative to the checkout root. '' = root. */
  buildRoot: string
  buildCommand: string
  /** Web only: the command the supervisor runs. */
  startCommand: string
  /** Static only: directory the build writes the site into. '' = auto. */
  outputDirectory: string
}

export type PackageManagerDetection = {
  manager: NodePackageManager
  /** What named it — a lockfile, or `packageManager` in package.json. */
  evidence: string
}

/**
 * Same precedence the daemon's release build uses
 * (`turbopaneld/src/deploy/release/build.ts`): pnpm > yarn > npm. Two
 * lockfiles in one repository is a repo bug; agreeing with the build is what
 * matters, not adjudicating it.
 */
const LOCKFILE_MANAGERS: readonly (readonly [string, NodePackageManager])[] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

function foundFile(
  files: readonly RepositoryProbedFile[],
  path: string,
): RepositoryProbedFile | undefined {
  return files.find((file) => file.path === path && file.found)
}

/**
 * `too_large` and `binary` refuse the *content*, not the file's existence —
 * for a presence question they are as good as found. Real pnpm lockfiles
 * routinely blow the probe's per-file cap, which is exactly the repository
 * that used to misreport npm here.
 */
function presentFile(
  files: readonly RepositoryProbedFile[],
  path: string,
): boolean {
  const file = files.find((entry) => entry.path === path)
  if (!file) return false
  return file.found || file.reason === 'too_large' || file.reason === 'binary'
}

/** True when the repository has a `package.json` at its root. */
export function isNodeApp(files: readonly RepositoryProbedFile[]): boolean {
  return foundFile(files, 'package.json') !== undefined
}

/**
 * Manager pinned by `packageManager` in package.json ("pnpm@11.22.0" — the
 * corepack pin). A fallback only: the daemon detects from the lockfile on disk
 * at build time, so when both exist the lockfile is what the build obeys.
 */
function declaredPackageManager(
  files: readonly RepositoryProbedFile[],
): NodePackageManager | undefined {
  const content = foundFile(files, 'package.json')?.content
  if (!content) return undefined
  try {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const pin = (parsed as { packageManager?: unknown }).packageManager
    if (typeof pin !== 'string') return undefined
    const name = pin.split('@')[0]
    return name === 'npm' || name === 'yarn' || name === 'pnpm'
      ? name
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Package manager named by a present lockfile, falling back to the
 * `packageManager` pin, or `undefined` when neither speaks. `undefined` is not
 * "npm" — the daemon will still detect at build time, so the honest answer
 * here is "nothing to show yet".
 */
export function detectPackageManager(
  files: readonly RepositoryProbedFile[],
): PackageManagerDetection | undefined {
  for (const [lockfile, manager] of LOCKFILE_MANAGERS) {
    if (presentFile(files, lockfile)) return { manager, evidence: lockfile }
  }
  const declared = declaredPackageManager(files)
  return declared ? { manager: declared, evidence: 'packageManager' } : undefined
}

export type PackageScripts = { build?: string; start?: string }

/**
 * `scripts.build` / `scripts.start` from the probed `package.json`, or
 * `undefined` when the file is absent, too large to have ridden along, or not
 * JSON. Parsing failure is a normal outcome for a file TurboPanel did not
 * write, never an error.
 */
export function readPackageScripts(
  files: readonly RepositoryProbedFile[],
): PackageScripts | undefined {
  const content = foundFile(files, 'package.json')?.content
  if (!content) return undefined
  try {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const scripts = (parsed as { scripts?: unknown }).scripts
    if (typeof scripts !== 'object' || scripts === null) return undefined
    const record = scripts as Record<string, unknown>
    return {
      ...(typeof record.build === 'string' ? { build: record.build } : {}),
      ...(typeof record.start === 'string' ? { start: record.start } : {}),
    }
  } catch {
    return undefined
  }
}

/** `pnpm run build` / `yarn run build` / `npm run build`. */
function runScript(manager: NodePackageManager | undefined, script: string): string {
  return `${manager ?? 'npm'} run ${script}`
}

/**
 * Suggested Simple-application config for what the inspection found.
 *
 * Deliberately conservative: a command is only suggested when the repository's
 * own `package.json` declares the script, because a suggested command that
 * fails on the first deploy is worse than an empty field with a good hint. The
 * daemon derives the install command itself, so suggestions never include
 * `npm install` — the build command is the build alone.
 */
export function suggestedSimpleAppConfig(
  inspection: RepositoryInspection | undefined,
): SimpleAppConfig {
  const files = inspection?.files ?? []
  const entries = inspection?.entries ?? []
  const manager = detectPackageManager(files)?.manager
  const scripts = readPackageScripts(files)
  const staticRoot = rootFromEntries(entries)

  const hasIndexHtml = foundFile(files, 'index.html') !== undefined
  // A repository whose only evidence is static files starts on the static
  // kind; a package.json means a process until the operator says otherwise.
  const kind: SimpleAppKind =
    !isNodeApp(files) && (staticRoot !== undefined || hasIndexHtml)
      ? 'static'
      : 'web'

  return {
    kind,
    buildRoot: '',
    buildCommand: scripts?.build ? runScript(manager, 'build') : '',
    startCommand: scripts?.start ? `${manager ?? 'npm'} start` : '',
    outputDirectory: staticRoot ?? '',
  }
}
