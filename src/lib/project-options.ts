import type {
  ComposeDocument,
  EnvironmentRecord,
  ProjectRecord,
} from '@/lib/instance-api'

export type ProjectOptionsPatch = {
  compose?: ComposeDocument
  containerNaming?: 'uuid' | 'custom'
  defaultServerId?: string | null
}

/**
 * Build a full `options` PATCH body. Project options replace (not merge) on
 * the server, so every save must preserve compose / naming / default server.
 */
export function buildProjectOptionsPatch(
  project: ProjectRecord,
  patch: ProjectOptionsPatch,
): ProjectOptionsPatch {
  const compose = patch.compose ?? project.options?.compose
  const containerNaming =
    patch.containerNaming ?? project.options?.containerNaming

  const defaultServerId =
    patch.defaultServerId !== undefined
      ? patch.defaultServerId
      : project.options?.defaultServerId

  const options: ProjectOptionsPatch = {}
  if (compose) options.compose = compose
  if (containerNaming) options.containerNaming = containerNaming
  if (defaultServerId !== undefined) {
    options.defaultServerId = defaultServerId
  }
  return options
}

/** Apply a PATCH-shaped options object onto local project.options state. */
export function mergeProjectOptionsLocal(
  current: ProjectRecord['options'],
  patch: ProjectOptionsPatch,
): NonNullable<ProjectRecord['options']> {
  const next: NonNullable<ProjectRecord['options']> = current
    ? { ...current }
    : {}
  if (patch.compose !== undefined) next.compose = patch.compose
  if (patch.containerNaming !== undefined) {
    next.containerNaming = patch.containerNaming
  }
  if (patch.defaultServerId === null) {
    delete next.defaultServerId
  } else if (patch.defaultServerId !== undefined) {
    next.defaultServerId = patch.defaultServerId
  }
  return next
}

/** Effective placement: environment pin wins, else project default. */
export function resolveEffectiveServerId(
  environmentServerId: string | null | undefined,
  projectDefaultServerId: string | null | undefined,
): string | null {
  if (environmentServerId) return environmentServerId
  return projectDefaultServerId ?? null
}

/**
 * Distinct servers actually placing this project's environments — each
 * environment's pin, falling back to the project default when unset.
 * Used for the project-level "x servers" inventory count (no server fetch
 * required; derived entirely from already-loaded project + environments).
 */
export function countDistinctProjectServers(
  project: ProjectRecord,
  environments: readonly EnvironmentRecord[],
): number {
  const ids = new Set<string>()
  for (const environment of environments) {
    const effective = resolveEffectiveServerId(
      environment.serverId,
      project.options?.defaultServerId,
    )
    if (effective) ids.add(effective)
  }
  return ids.size
}
