/**
 * Display labels for servers and environments.
 *
 * One implementation each — call sites resolved these inline with slightly
 * different fallbacks, which is how the same server ended up rendered as a
 * hostname in one panel and a raw UUID in another.
 */

export type ServerNameSource = Readonly<{
  id: string
  name?: string | null
  hostname?: string | null
}>

export type EnvironmentNameSource = Readonly<{
  name?: string | null
  serverId?: string | null
}>

/** Server label: display name → hostname → short id. Never a bare UUID. */
export function serverDisplayName(server: ServerNameSource): string {
  return (
    server.name?.trim() ||
    server.hostname?.trim() ||
    server.id.slice(0, 8)
  )
}

/**
 * Label for a server id against a (possibly not-yet-loaded) server list.
 * Returns null for no id, and the id itself when the list has no match — the
 * id is still more useful than an empty cell.
 */
export function resolveServerLabel(
  serverId: string | null | undefined,
  servers: readonly ServerNameSource[] | undefined,
): string | null {
  const id = serverId?.trim()
  if (!id) return null
  const server = servers?.find((row) => row.id === id)
  return server ? serverDisplayName(server) : id
}

/**
 * Label for an environment.
 *
 * Platform (system) projects create **one environment per server** and name
 * every one after the component, so a plain name renders the same string on
 * every chip. Pass `preferServer` for those and the placement is used instead;
 * the environment name remains the fallback until servers load.
 */
export function environmentDisplayName(
  environment: EnvironmentNameSource,
  options: Readonly<{
    servers?: readonly ServerNameSource[]
    /** Resolve the placed server first (platform projects). */
    preferServer?: boolean
  }> = {},
): string {
  const named = environment.name?.trim() || 'Environment'
  if (!options.preferServer) return named
  const id = environment.serverId?.trim()
  if (!id) return named
  const server = options.servers?.find((row) => row.id === id)
  return server ? serverDisplayName(server) : named
}
