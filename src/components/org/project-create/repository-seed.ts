/**
 * Turns "this repository" into the compose draft the wizard hands to
 * `ComposeStep`. Pure on purpose — the picker in `repository-step.tsx` owns the
 * query and the chrome, this owns the document, and only this half is worth
 * unit testing.
 */

import type { ComposeDocument } from '@/lib/compose'
import {
  patchServiceTurbopanelExtension,
  SOURCE_BRANCH_MAX_LENGTH,
  type ComposeServiceSourceExtension,
} from '@/lib/compose/service-kind'
import type { SourceRecord } from '@/lib/instance-api'

/** Compose key when the repository name yields nothing usable. */
const FALLBACK_SERVICE_NAME = 'app'

/** Docker keeps service keys short; this is well past anything readable. */
const SERVICE_NAME_MAX_LENGTH = 63

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
export function repositoryServiceName(source: SourceRecord): string {
  const slug = repositoryName(source.repositoryUrl)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SERVICE_NAME_MAX_LENGTH)
    .replaceAll(/-+$/g, '')
  return slug.length > 0 ? slug : FALLBACK_SERVICE_NAME
}

/**
 * One service bound to `source`, ready for the compose surface.
 *
 * **Why `serviceKind: node`.** A service needs `image` or `build` unless it is
 * host-native (`traditional-web` / `node`) or Railpack-built — the control
 * plane rejects anything else with `compose_invalid`, so a binding on its own
 * is not a document the operator could create. `node` is the lane a Git
 * binding already means: check out, build, promote a release on the host, with
 * `buildKind` left off because omitted *is* that default. Railpack would be the
 * other valid shape, but picking it here would pin a build backend the operator
 * never asked for — and the YAML surface hides `x-turbopanel`, so its lint
 * would then report the hidden service as missing `image`. Whichever lane the
 * repository actually needs, the Services tab is one press away.
 */
export function seedRepositoryCompose(
  source: SourceRecord,
  branch: string,
): ComposeDocument {
  const trimmedBranch = branch.trim().slice(0, SOURCE_BRANCH_MAX_LENGTH)
  const binding: ComposeServiceSourceExtension = {
    sourceId: source.id,
    ...(trimmedBranch ? { branch: trimmedBranch } : {}),
  }
  const service = patchServiceTurbopanelExtension(
    {},
    { serviceKind: 'node', source: binding },
  )

  return {
    version: 1,
    data: { services: { [repositoryServiceName(source)]: service } },
    presentation: { keyOrder: ['services'], comments: {} },
  }
}
