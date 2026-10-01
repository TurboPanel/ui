import type { BindingRecord, ServiceApp, ServiceRecord } from '@/lib/instance-api'

/** Why a detected application cannot use the database it is bound to. */
export type AppDatabaseProblem = 'postgres' | 'no-database'

export type AppDatabaseWarning = Readonly<{
  problem: AppDatabaseProblem
  /** The one-line statement, shown as the notice title. */
  title: string
  /** What to do about it. */
  body: string
}>

/** Per compose service: the detected app's tag and, when relevant, its warning. */
export type ServiceAppFacts = Readonly<{
  /** `WordPress` — the tag on the service box and row. */
  label: string
  warning: AppDatabaseWarning | null
}>

const SQL_ENGINES_FOR_WORDPRESS: ReadonlySet<string> = new Set(['mysql', 'mariadb'])

/** The tag a service carries once the daemon recognises its application. */
export function appTagLabel(app: ServiceApp | null | undefined): string | null {
  return app?.kind === 'wordpress' ? 'WordPress' : null
}

/**
 * WordPress only speaks MySQL or MariaDB. A site bound to Postgres cannot work;
 * a site with no database bound at all cannot either, unless its configuration
 * points at one the control plane does not know about — so that case is worded
 * as a check, not a verdict.
 *
 * A binding whose engine is not reported is unknown, and unknown never warns.
 */
export function wordpressDatabaseProblem(
  bindings: readonly Pick<BindingRecord, 'engine'>[]
): AppDatabaseProblem | null {
  if (bindings.length === 0) return 'no-database'
  if (bindings.some((b) => b.engine === null)) return null
  if (bindings.some((b) => SQL_ENGINES_FOR_WORDPRESS.has(b.engine ?? ''))) return null
  return bindings.some((b) => b.engine === 'postgres') ? 'postgres' : 'no-database'
}

const WORDPRESS_TITLE = 'WordPress needs MySQL or MariaDB'

function warningFor(problem: AppDatabaseProblem): AppDatabaseWarning {
  if (problem === 'postgres') {
    return {
      problem,
      title: WORDPRESS_TITLE,
      body: 'This site is bound to a Postgres database, which WordPress cannot use. Bind a MySQL or MariaDB database instead.',
    }
  }
  return {
    problem,
    title: WORDPRESS_TITLE,
    body: 'No MySQL or MariaDB database is bound to this site. Bind one, unless the site already points at a database elsewhere.',
  }
}

/**
 * Facts for every service the daemon recognised an application in. Services
 * without a detected application are absent — plain PHP and static sites get no
 * tag and no warning. `bindings` is `undefined` until they have loaded, so a
 * slow read never shows a false "no database" warning.
 */
export function appFactsByService(
  services: readonly Pick<ServiceRecord, 'id' | 'composeServiceName' | 'app'>[],
  bindings: readonly BindingRecord[] | undefined
): Record<string, ServiceAppFacts> {
  const out: Record<string, ServiceAppFacts> = {}
  for (const service of services) {
    const label = appTagLabel(service.app)
    if (!label || !service.composeServiceName) continue
    // Bindings still loading: tag the service, but say nothing about its database.
    const problem = bindings
      ? wordpressDatabaseProblem(bindings.filter((binding) => binding.serviceId === service.id))
      : null
    out[service.composeServiceName] = { label, warning: problem ? warningFor(problem) : null }
  }
  return out
}
