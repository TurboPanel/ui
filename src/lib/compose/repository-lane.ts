/**
 * Which lane a repository wants, inferred from what is actually in it.
 *
 * **Detect, then confirm — never one or the other.** Pure detection is wrong:
 * a repository can hold a `Dockerfile`, a `package.json`, *and* a
 * `public/index.html`, and the operator's intent is not in the files. Pure
 * asking is also wrong: once the repository has been read, hiding what was
 * found is perverse. So the ranking below picks a default and every candidate
 * carries the **evidence** that chose it, which is what turns an override into
 * an informed act rather than a guess.
 */

export type RepositoryLane = 'compose' | 'site-php' | 'app' | 'static'

/** One probed file, as `GET /sources/:id/inspect` reports it. */
export type ProbedFile = { path: string; found: boolean }

export type LaneCandidate = {
  lane: RepositoryLane
  /** What in the repository points at this lane — rendered on the card. */
  evidence: string
  /** True for the lane the wizard preselects. */
  recommended: boolean
}

const COMPOSE_FILENAMES = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yaml',
  'compose.yml',
]

function has(files: readonly ProbedFile[], path: string): boolean {
  return files.some((file) => file.path === path && file.found)
}

function firstPresent(
  files: readonly ProbedFile[],
  paths: readonly string[],
): string | undefined {
  return paths.find((path) => has(files, path))
}

/**
 * Rank every lane, most-likely first.
 *
 * All four are always returned so the picker can show them together with their
 * evidence — including the ones that found nothing, which is itself useful
 * ("no `package.json` found" tells the operator why App is not the default).
 */
export function rankRepositoryLanes(
  files: readonly ProbedFile[],
  entries: readonly { path: string; kind: 'file' | 'dir' }[] = [],
): LaneCandidate[] {
  const composeFile = firstPresent(files, COMPOSE_FILENAMES)
  const phpFile = firstPresent(files, ['composer.json', 'index.php'])
  const appFile = firstPresent(files, [
    'package.json',
    'deno.json',
    'pyproject.toml',
    'requirements.txt',
  ])
  const staticDir = entries.find(
    (entry) => entry.kind === 'dir' && (entry.path === 'public' || entry.path === 'dist'),
  )?.path
  const staticFile = has(files, 'index.html') ? 'index.html' : undefined

  const ranked: RepositoryLane[] = []
  if (composeFile) ranked.push('compose')
  if (phpFile) ranked.push('site-php')
  if (appFile) ranked.push('app')
  if (staticDir || staticFile) ranked.push('static')

  const winner = ranked[0]
  const describe = (
    lane: RepositoryLane,
    found: string | undefined,
    missing: string,
  ): LaneCandidate => ({
    lane,
    evidence: found ?? `no ${missing} found`,
    recommended: lane === winner,
  })

  return [
    describe('compose', composeFile, 'compose file'),
    describe('site-php', phpFile, 'composer.json or index.php'),
    describe('app', appFile, 'package.json'),
    describe('static', staticDir ?? staticFile, 'index.html or public/'),
  ]
}

/** The lane the wizard preselects, or `undefined` when nothing matched. */
export function recommendedLane(
  candidates: readonly LaneCandidate[],
): RepositoryLane | undefined {
  return candidates.find((candidate) => candidate.recommended)?.lane
}

/** Compose filename the repository actually has, for the compose lane. */
export function detectedComposePath(
  files: readonly ProbedFile[],
): string | undefined {
  return firstPresent(files, COMPOSE_FILENAMES)
}

/**
 * Document root a repository's own layout implies.
 *
 * `public` and `dist` are the two conventions worth honouring; anything else is
 * the operator's call, and `public` stays the default because that is what the
 * daemon assumes when a site names none.
 */
export function rootFromEntries(
  entries: readonly { path: string; kind: 'file' | 'dir' }[],
): string | undefined {
  for (const candidate of ['public', 'dist']) {
    if (entries.some((e) => e.kind === 'dir' && e.path === candidate)) {
      return candidate
    }
  }
  return undefined
}
