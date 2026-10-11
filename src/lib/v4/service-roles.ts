/** Which services are apps, which are data, and what each kind is called. */

import type { V4Service } from './types'

/** Images that are data stores run as plain containers. */
const DATA_STORE_IMAGE_RE = /^(redis|valkey|memcached|mongo|postgres|mysql|mariadb)/

/** A container running a well-known data store image (redis, postgres, ...). */
export function isDataStoreContainer(service: V4Service): boolean {
  return service.kind === 'container' && DATA_STORE_IMAGE_RE.test(service.image ?? '')
}

/** A service with settings of its own (not a database or a data store). */
export function isAppService(service: V4Service): boolean {
  return service.kind !== 'database' && !isDataStoreContainer(service)
}

const KIND_LABELS: Readonly<Record<V4Service['kind'], string>> = {
  node: 'Node.js app',
  site: 'Website',
  container: 'Container',
  database: 'Database we run and back up for you',
}

export function serviceKindLabel(kind: V4Service['kind']): string {
  return KIND_LABELS[kind]
}
