import { useMemo, useState } from 'react'
import { View } from 'react-native'
import { CacheDeleteSheet } from '@/components/org/project/caches/cache-delete-sheet'
import { CacheMenu, type CacheMenuAction } from '@/components/org/project/caches/cache-menu'
import { CacheSheet } from '@/components/org/project/caches/cache-sheet'
import { CacheVariablesSheet } from '@/components/org/project/caches/cache-variables-sheet'
import { useProjectContext } from '@/components/org/project/project-context'
import { ActionButton } from '@/components/ui/v4/action-button'
import { EmptyPanel } from '@/components/ui/v4/empty-panel'
import { ListGroup } from '@/components/ui/v4/list-group'
import { ListRow } from '@/components/ui/v4/list-row'
import { SectionHeading } from '@/components/ui/v4/section-heading'
import { StatusChip } from '@/components/ui/v4/status-chip'
import type { CacheRecord } from '@/lib/instance-api'
import { useEnvironmentCaches } from '@/lib/queries/caches'
import { useProjectPrincipals } from '@/lib/queries/projects'
import { useServices } from '@/lib/queries/services'
import {
  cacheAccessLabel,
  cacheAccountChoices,
  cacheCountNote,
  cacheRowSub,
  cacheStatusKey,
} from '@/lib/v4/project-caches'

type Dialog =
  | Readonly<{ kind: 'add' }>
  | Readonly<{ kind: 'edit' | 'variables' | 'delete'; cache: CacheRecord }>

function CacheRow({
  cache,
  canManage,
  onAction,
}: Readonly<{
  cache: CacheRecord
  canManage: boolean
  onAction: (action: CacheMenuAction, cache: CacheRecord) => void
}>) {
  return (
    <ListRow
      title={cache.name}
      sub={cacheRowSub(cache)}
      value={cacheAccessLabel(cache)}
      leading={<StatusChip status={cacheStatusKey(cache.status)} size="sm" />}
      trailing={
        <CacheMenu
          name={cache.name}
          canManage={canManage}
          onSelect={(action) => onAction(action, cache)}
        />
      }
      tall
    />
  )
}

/**
 * The Caches card on the environment page: each project cache with its status,
 * access, memory limit and Hosting Account, and Add Cache. An older control
 * plane without the route shows nothing at all.
 */
export function CachesSection() {
  const {
    orgId,
    projectId,
    selectedEnvironment,
    pathEnvironmentId,
    canManage,
    isSystemProject,
    projectAllowsMutations,
  } = useProjectContext()
  const environmentId = pathEnvironmentId ?? selectedEnvironment?.id ?? ''
  const writable = canManage && !isSystemProject && projectAllowsMutations
  const caches = useEnvironmentCaches(orgId, environmentId)
  const principals = useProjectPrincipals(orgId, projectId, { enabled: writable })
  const services = useServices(orgId, environmentId, { enabled: writable })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const accounts = useMemo(
    () =>
      cacheAccountChoices(
        principals.data?.principals ?? [],
        (services.data?.services ?? []).map((service) => service.id)
      ),
    [principals.data, services.data]
  )
  if (environmentId === '' || caches.data === undefined) return null
  const rows = caches.data.caches
  const close = () => setDialog(null)
  const open = (action: CacheMenuAction, cache: CacheRecord) => {
    const kind = action === 'edit' || action === 'delete' ? action : 'variables'
    setDialog({ kind, cache })
  }
  return (
    <View>
      <SectionHeading
        title="Caches"
        note={cacheCountNote(rows.length)}
        action={
          writable ? (
            <ActionButton label="Add Cache" size="sm" onPress={() => setDialog({ kind: 'add' })} />
          ) : undefined
        }
      />
      <ListGroup
        empty={
          <EmptyPanel
            inline
            title="No caches yet"
            body="A cache is a private Valkey process that the sites and apps of one Hosting Account can use."
          />
        }
      >
        {rows.map((cache) => (
          <CacheRow key={cache.id} cache={cache} canManage={writable} onAction={open} />
        ))}
      </ListGroup>
      {dialog?.kind === 'add' || dialog?.kind === 'edit' ? (
        <CacheSheet
          orgId={orgId}
          environmentId={environmentId}
          visible
          cache={dialog.kind === 'edit' ? dialog.cache : null}
          accounts={accounts}
          accountsLoading={principals.isPending || services.isPending}
          onClose={close}
        />
      ) : null}
      <CacheVariablesSheet
        cache={dialog?.kind === 'variables' ? dialog.cache : null}
        onClose={close}
      />
      <CacheDeleteSheet
        orgId={orgId}
        environmentId={environmentId}
        cache={dialog?.kind === 'delete' ? dialog.cache : null}
        onClose={close}
      />
    </View>
  )
}
