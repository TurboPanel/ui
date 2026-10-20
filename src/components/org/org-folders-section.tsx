import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  InlineNotice,
  LoadingState,
  SectionPanel,
  type BadgeTone,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { FolderActionButton } from '@/components/org/folder-action-button'
import { folderLine, folderStateLabel } from '@/lib/directory-names'
import type { FolderState, OrgFolderRecord } from '@/lib/instance-api'
import { useOrgFolders, useRemoveFolder } from '@/lib/queries/folders'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const STATE_TONES: Record<FolderState, BadgeTone> = {
  planned: 'pending',
  present: 'ok',
  removing: 'pending',
  orphan: 'danger',
  missing: 'danger',
}

function countLabel(count: number): string {
  return count === 1 ? '1 folder' : `${count} folders`
}

/** Rows shown at first, and the most the list asks the panel for (the panel's own page cap). */
const FIRST_PAGE = 50
const MAX_PAGE = 100

function FolderRow({
  folder,
  busy,
  disabled,
  onRun,
}: Readonly<{
  folder: OrgFolderRecord
  busy: boolean
  disabled: boolean
  onRun: (folderId: string) => void
}>) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.line}>{folderLine(folder)}</Text>
        <Badge label={folderStateLabel(folder.state)} tone={STATE_TONES[folder.state]} />
      </View>
      <Text style={panelStyles.muted}>
        Hosting Account {folder.owner}, folder {folder.scope}/{folder.slug}
      </Text>
      {folder.reason ? <Text style={panelStyles.muted}>{folder.reason}</Text> : null}
      <FolderActionButton
        action={folder.action}
        busy={busy}
        disabled={disabled}
        onRun={() => onRun(folder.id)}
      />
    </View>
  )
}

/**
 * Folders on your servers that need a person: ones no service or volume owns
 * (kept after a service left the compose file, or found on a server with no
 * record), removals the server has not finished, and folders the server no
 * longer has. Each one still blocks renaming, moving or deleting its
 * environment until it is settled. Hidden while there is nothing to settle.
 */
export function OrgFoldersSection({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [limit, setLimit] = useState(FIRST_PAGE)
  const query = useOrgFolders(orgId, canManage, limit)
  const remove = useRemoveFolder(orgId)
  if (!canManage) return null
  if (query.isLoading) {
    return (
      <SectionPanel title="Folders that need attention">
        <LoadingState label="Checking the folders on your servers…" />
      </SectionPanel>
    )
  }
  if (query.isError) {
    return (
      <SectionPanel title="Folders that need attention">
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Could not load the folders on your servers.')}
        </Text>
      </SectionPanel>
    )
  }
  const folders = query.data?.folders ?? []
  const total = query.data?.total ?? 0
  if (total === 0) return null
  const orphans = folders.filter((folder) => folder.state === 'orphan').length
  return (
    <SectionPanel title="Folders that need attention" hint={countLabel(total)}>
      {orphans > 0 ? (
        <InlineNotice
          tone="warning"
          title={
            orphans === 1
              ? '1 folder on your servers no longer belongs to a service or volume'
              : `${orphans} folders on your servers no longer belong to a service or volume`
          }
          body="They keep their files and stop their environment from being renamed, moved or deleted. Remove them, or create a service or volume with the same name to take one over."
        />
      ) : null}
      {remove.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(remove.error, 'Could not change that folder.')}
        </Text>
      ) : null}
      {folders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder}
          busy={remove.isPending && remove.variables === folder.id}
          disabled={remove.isPending}
          onRun={(folderId) => remove.mutate(folderId)}
        />
      ))}
      {total > folders.length && limit < MAX_PAGE ? (
        <Button
          label={`Show more (${total - folders.length} not shown)`}
          size="sm"
          onPress={() => setLimit(MAX_PAGE)}
        />
      ) : null}
      {total > folders.length && limit >= MAX_PAGE ? (
        <Text style={panelStyles.muted}>
          and {total - folders.length} more. Settle some of these to see the rest.
        </Text>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  line: { color: colors.text, fontSize: 14, flexShrink: 1 },
})
