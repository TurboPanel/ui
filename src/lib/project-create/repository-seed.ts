/**
 * Turns "this repository" into the compose draft the wizard hands to
 * `ComposeStep`. Pure on purpose — the picker in `repository-step.tsx` owns the
 * query and the chrome, this owns the document, and only this half is worth
 * unit testing.
 */

import type { ComposeDocument } from '@/lib/compose'
import { yamlToComposeDocument } from '@/lib/compose/convert'
import {
  DEFAULT_PHP_SERIES,
  DEFAULT_SITE_ENGINE,
  patchServiceTurbopanelExtension,
  SOURCE_BRANCH_MAX_LENGTH,
  SOURCE_COMMAND_MAX_LENGTH,
  type ComposeServiceSourceExtension,
} from '@/lib/compose/service-kind'
import { writeComposePrincipals } from '@/lib/compose/principals-document'
import type { RepositoryLane } from '@/lib/compose/repository-lane'
import type { RepositoryRecord } from '@/lib/instance-api'

/** Compose key when the repository name yields nothing usable. */
const FALLBACK_SERVICE_NAME = 'app'

/**
 * Alias every seeded host-native service runs as.
 *
 * Sites and Node apps require one — the document root, the release tree, and
 * any scheduled jobs belong to an account — so a seed that declared none would
 * hand the operator a draft the save rejects. One account for the one service a
 * seed creates is also the right default: a second is a decision, and the
 * Accounts section is where it gets made.
 */
const SEED_PRINCIPAL_ALIAS = 'app'

/** Docker keeps service keys short; this is well past anything readable. */
const SERVICE_NAME_MAX_LENGTH = 63

/** Strip leading and trailing dashes without a backtracking regex. */
function trimDashes(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && value.charAt(start) === '-') {
    start += 1
  }
  while (end > start && value.charAt(end - 1) === '-') {
    end -= 1
  }
  return value.slice(start, end)
}

/**
 * Repository name from a clone URL — the last path segment, `.git` dropped.
 *
 * Deliberately not `repositoryLabel` from the Sources panel: that renders
 * `owner/name` for a human, and a slash is not usable as a compose key.
 */
function repositoryName(repositoryUrl: string): string {
  const withoutSuffix = repositoryUrl.replace(/\.git$/, '')
  const segments = withoutSuffix.split(/[/:]/).filter((part) => part.length > 0)
  return segments.at(-1) ?? ''
}

/**
 * Compose service key for a repository — lowercase, `[a-z0-9-]`, never leading
 * or trailing `-`. The operator renames it on the Services tab if they want
 * something else; this only has to be valid and recognisable.
 */
export function repositoryServiceName(source: RepositoryRecord): string {
  const collapsed = repositoryName(source.repositoryUrl)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
  const slug = trimDashes(trimDashes(collapsed).slice(0, SERVICE_NAME_MAX_LENGTH))
  return slug.length > 0 ? slug : FALLBACK_SERVICE_NAME
}

/**
 * Seed a compose draft for one repository lane.
 *
 * The compose document key is intentionally still `x-turbopanel.source`.
 *
 * Replaces the old always-`serviceKind: node` seed, which was accurate to the
 * code and wrong about the product: a repository is not necessarily a Node app,
 * and for the compose lane it is not a synthesized service at all.
 *
 * The invariant that made `node` defensible still holds and is respected here:
 * a compose service needs `image` or `build` unless it is host-native (`site` /
 * `node`) or Railpack-built, so every synthesized lane below is host-native and
 * therefore a valid document on its own.
 */
export function seedComposeForLane(params: {
  source: RepositoryRecord
  branch: string
  lane: RepositoryLane
  /** Parsed repo compose, for the `compose` lane. */
  repositoryCompose?: ComposeDocument
  /** Document root the detection found (`public`, `dist`, else `.`). */
  root?: string
  /** Engine for the PHP lane. */
  engine?: 'caddy' | 'nginx' | 'apache' | 'openlitespeed'
  /**
   * Simple-application fields the repository screen collects for the `app` and
   * `static` lanes. Empty strings mean "platform default" and are written as
   * nothing at all: the daemon derives the install command, falls back to
   * `server.js`, and a key that says the default out loud would pin it.
   */
  simple?: {
    buildCommand?: string
    /** `app` lane only — a static site has no process to start. */
    startCommand?: string
    /** Directory the build runs in, relative to the checkout root. */
    subdirectory?: string
  }
}): ComposeDocument {
  const { source, branch, lane } = params
  // The repository's own document IS the project compose — no synthesized
  // service, and deliberately no `x-turbopanel`: what the operator authored
  // upstream should not silently acquire TurboPanel metadata on import.
  if (lane === 'compose' && params.repositoryCompose) {
    return params.repositoryCompose
  }

  const trimmedBranch = branch.trim().slice(0, SOURCE_BRANCH_MAX_LENGTH)
  const capped = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim().slice(0, SOURCE_COMMAND_MAX_LENGTH)
    return trimmed || undefined
  }
  // Build fields apply to the two lanes the Simple form configures; the
  // compose lane ships the repository's own document and the PHP lane serves
  // the tree as checked out, so neither takes a build.
  const simple = lane === 'app' || lane === 'static' ? params.simple : undefined
  const buildCommand = capped(simple?.buildCommand)
  const startCommand = lane === 'app' ? capped(simple?.startCommand) : undefined
  const subdirectory = capped(simple?.subdirectory)
  const binding: ComposeServiceSourceExtension = {
    sourceId: source.id,
    ...(trimmedBranch ? { branch: trimmedBranch } : {}),
    ...(subdirectory ? { subdirectory } : {}),
    ...(buildCommand ? { buildCommand } : {}),
    ...(startCommand ? { startCommand } : {}),
  }

  const extension = lane === 'app'
    ? {
      serviceKind: 'node' as const,
      principal: SEED_PRINCIPAL_ALIAS,
      source: binding,
    }
    : {
      serviceKind: 'site' as const,
      engine: params.engine ?? DEFAULT_SITE_ENGINE,
      root: params.root ?? 'public',
      principal: SEED_PRINCIPAL_ALIAS,
      source: binding,
      // An empty `php: {}` would be a no-op twice over: the extension parser
      // drops an empty block, and the daemon's `siteNeedsPhp` requires a
      // non-empty one. Naming the default series is what actually turns PHP on.
      ...(lane === 'site-php' ? { php: { version: DEFAULT_PHP_SERIES } } : {}),
    }

  const service = patchServiceTurbopanelExtension({}, extension)
  return withSeedPrincipal({
    version: 1,
    data: { services: { [repositoryServiceName(source)]: service } },
    presentation: { keyOrder: ['services'], comments: {} },
  })
}

/**
 * Declare the alias the seeded service names.
 *
 * A per-service `principal` that resolves to nothing is a dangling reference —
 * the linter says so, and deploy-prepare refuses it — so the two are written
 * together or not at all.
 */
function withSeedPrincipal(document: ComposeDocument): ComposeDocument {
  return writeComposePrincipals(document, { [SEED_PRINCIPAL_ALIAS]: {} })
}

/**
 * Parse a repository's own compose file into a document.
 *
 * Returns `undefined` rather than throwing: this is YAML TurboPanel did not
 * write, so it can be anything. The caller falls back to a lane it can actually
 * seed instead of handing the operator a draft that cannot be created.
 */
export function parseRepositoryCompose(
  content: string,
): ComposeDocument | undefined {
  try {
    const document = yamlToComposeDocument(content)
    const services = document.data.services
    if (typeof services !== 'object' || services === null) return undefined
    return document
  } catch {
    return undefined
  }
}

/**
 * Seed the compose draft for the **Hosting** card: one site, no repository.
 *
 * Deliberately not a separate creation path. Every deployable in TurboPanel
 * resolves through `environment → service → hosting`, and `service` rows are
 * written only by `reconcileServicesFromCompose` — a non-compose entry point
 * would need a second writer, a second deploy-prepare, and second read paths,
 * which is a parallel product that will drift. A site already *is* "a directory
 * and an account"; compose is just the declaration format, and for a site it
 * declares almost nothing.
 *
 * `sourceKind: 'managed-directory'` is what makes the webroot the principal's
 * rather than a release tree the daemon publishes into. It names the trade
 * explicitly — the tree the engine executes is writable by the account running
 * it — which is right for an application that writes to itself and wrong for a
 * built one. Connecting a repository later flips this one field.
 *
 * Caddy by default: a static site then needs no engine choice, no PHP pool, and
 * no vhost tuning at all. PHP is one field away on the Services tab.
 */
export function seedHostingCompose(params: {
  serviceName?: string
  root?: string
  engine?: 'caddy' | 'nginx' | 'apache' | 'openlitespeed'
  /** Turn PHP on with the default series. Omit for a static site. */
  php?: boolean
}): ComposeDocument {
  const service = patchServiceTurbopanelExtension(
    {},
    {
      serviceKind: 'site',
      engine: params.engine ?? DEFAULT_SITE_ENGINE,
      root: params.root ?? 'public',
      sourceKind: 'managed-directory',
      principal: SEED_PRINCIPAL_ALIAS,
      // An empty `php: {}` is a no-op twice over — the extension parser drops an
      // empty block and the daemon's `siteNeedsPhp` requires a non-empty one —
      // so naming the default series is what actually turns PHP on.
      ...(params.php ? { php: { version: DEFAULT_PHP_SERIES } } : {}),
    },
  )
  return withSeedPrincipal({
    version: 1,
    data: { services: { [params.serviceName ?? 'site']: service } },
    presentation: { keyOrder: ['services'], comments: {} },
  })
}
