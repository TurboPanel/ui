import { useState } from 'react'
import { Text } from 'react-native'
import { Checkbox } from '@/components/ui'
import { ActionButton } from '@/components/ui/v4/action-button'
import { Sheet } from '@/components/ui/v4/sheet'
import { typeStyle } from '@/components/ui/v4/type-styles'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import type { CacheRecord } from '@/lib/instance-api'
import { useDeleteCache } from '@/lib/queries/caches'
import { failedRunMessage } from '@/lib/user-error'
import { CACHE_DELETE_DATA_LABEL, CACHE_RECORD_ONLY_NOTE } from '@/lib/v4/project-caches'

const styles = themedStyles((p) => ({
  hint: { ...typeStyle('body', 'footnote'), color: p.text3 },
  error: { ...typeStyle('body', 'footnote'), color: p.bad },
}))

/** Delete a cache. The cached data goes with it unless the box is cleared. */
export function CacheDeleteSheet({
  orgId,
  environmentId,
  cache,
  onClose,
}: Readonly<{
  orgId: string
  environmentId: string
  cache: CacheRecord | null
  onClose: () => void
}>) {
  const s = styles(usePalette())
  const remove = useDeleteCache(orgId, environmentId)
  const [deleteData, setDeleteData] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const close = () => {
    setDeleteData(true)
    setError(null)
    setNote(null)
    onClose()
  }

  const confirm = async () => {
    if (cache === null || remove.isPending) return
    setError(null)
    const result = await remove.run({ cacheId: cache.id, deleteData })
    if (!result.ok) {
      setError(failedRunMessage(result, 'Could not delete the cache.'))
      return
    }
    if (result.value.removed === 'record_only') {
      setNote(CACHE_RECORD_ONLY_NOTE)
      return
    }
    close()
  }

  const name = cache?.name ?? ''
  return (
    <Sheet
      visible={cache !== null}
      onClose={close}
      title={`Delete ${name}`}
      footer={
        note === null ? (
          <>
            <ActionButton label="Cancel" variant="quiet" onPress={close} />
            <ActionButton
              label="Delete Cache"
              variant="danger"
              busy={remove.isPending}
              busyLabel="Deleting…"
              onPress={() => {
                confirm().catch(() => setError('Could not delete the cache.'))
              }}
            />
          </>
        ) : (
          <ActionButton label="Close" variant="primary" onPress={close} />
        )
      }
    >
      {note === null ? (
        <>
          <Text style={s.hint}>This stops the cache and removes it from this environment.</Text>
          <Checkbox
            checked={deleteData}
            onPress={() => setDeleteData((value) => !value)}
            label={CACHE_DELETE_DATA_LABEL}
            accessibilityLabel={CACHE_DELETE_DATA_LABEL}
          />
          {error === null ? null : <Text style={s.error}>{error}</Text>}
        </>
      ) : (
        <Text style={s.hint}>{note}</Text>
      )}
    </Sheet>
  )
}
