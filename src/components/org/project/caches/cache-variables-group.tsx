import { View } from 'react-native'
import { useProjectContext } from '@/components/org/project/project-context'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { useEnvironmentCaches } from '@/lib/queries/caches'
import { CACHE_VARIABLES_NOTE } from '@/lib/v4/project-caches'
import { plural } from '@/lib/v4/text'

/**
 * The variables the environment's caches set, read-only. They are computed at
 * deploy and never stored, so they cannot be edited or overridden here. Shows
 * nothing when there are no caches.
 */
export function CacheVariablesGroup() {
  const { orgId, selectedEnvironment, pathEnvironmentId } = useProjectContext()
  const environmentId = pathEnvironmentId ?? selectedEnvironment?.id ?? ''
  const caches = useEnvironmentCaches(orgId, environmentId)
  const rows = (caches.data?.caches ?? []).flatMap((cache) =>
    cache.variables.map((name) => ({ cache: cache.name, name }))
  )
  if (rows.length === 0) return null
  return (
    <View>
      <SectionHeading title="From Caches" note={plural(rows.length, 'variable')} />
      <ListGroup
        foot={`${CACHE_VARIABLES_NOTE} Values are never shown.`}
        empty={<EmptyPanel inline title="No cache variables" />}
      >
        {rows.map((row) => (
          <ListRow
            key={`${row.cache}:${row.name}`}
            title={row.name}
            sub={`From cache ${row.cache}`}
          />
        ))}
      </ListGroup>
    </View>
  )
}
