import { StyleSheet, Text, View } from 'react-native'
import { Badge, LoadingState, SectionPanel, type BadgeTone } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { FolderActionButton } from '@/components/org/folder-action-button'
import {
  folderActionFor,
  folderLine,
  folderLockExplanation,
  folderStateLabel,
} from '@/lib/directory-names'
import type { EnvironmentFolderRecord, FolderState } from '@/lib/instance-api'
import { useEnvironmentFolders, useRemoveFolder } from '@/lib/queries/folders'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const STATE_TONES: Record<FolderState, BadgeTone> = {
  planned: 'pending',
  present: 'ok',
  removing: 'pending',
  orphan: 'danger',
  missing: 'danger',
}

function FolderRow({
  folder,
  canManage,
  busy,
  disabled,
  onRun,
}: Readonly<{
  folder: EnvironmentFolderRecord
  canManage: boolean
  busy: boolean
  disabled: boolean
  onRun: (folderId: string) => void
}>) {
  const action = canManage ? folderActionFor(folder.state) : null
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.line}>{folderLine(folder)}</Text>
        <Badge label={folderStateLabel(folder.state)} tone={STATE_TONES[folder.state]} />
      </View>
      {folder.reason ? <Text style={panelStyles.muted}>{folder.reason}</Text> : null}
      <FolderActionButton
        action={action}
        busy={busy}
        disabled={disabled}
        onRun={() => onRun(folder.id)}
      />
    </View>
  )
}

/**
 * The folders that exist on servers under an environment's name. While any
 * exists the environment cannot be renamed, moved to another server or
 * deleted, so this list is the plain-words reason. A folder being removed says
 * what it is waiting for (for example an offline server); a folder TurboPanel
 * did not create is shown as not in TurboPanel until an admin clears it.
 */
export function EnvironmentFoldersPanel({
  orgId,
  environmentId,
  canManage = false,
}: Readonly<{ orgId: string; environmentId: string; canManage?: boolean }>) {
  const query = useEnvironmentFolders(orgId, environmentId)
  const remove = useRemoveFolder(orgId)
  const total = query.data?.total ?? 0
  const folders = query.data?.folders ?? []
  if (query.isLoading) {
    return (
      <SectionPanel title="Folders on your servers">
        <LoadingState label="Checking for folders…" />
      </SectionPanel>
    )
  }
  if (query.isError) {
    return (
      <SectionPanel title="Folders on your servers">
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Could not load the folders on your servers.')} Renaming,
          moving or deleting this environment may be refused until they load.
        </Text>
      </SectionPanel>
    )
  }
  const explanation = folderLockExplanation(total)
  if (!explanation) return null
  return (
    <SectionPanel
      title="Folders on your servers"
      hint={total === 1 ? '1 folder' : `${total} folders`}
    >
      <Text style={panelStyles.muted}>{explanation}</Text>
      {remove.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(remove.error, 'Could not change that folder.')}
        </Text>
      ) : null}
      {folders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder}
          canManage={canManage}
          busy={remove.isPending && remove.variables === folder.id}
          disabled={remove.isPending}
          onRun={(folderId) => remove.mutate(folderId)}
        />
      ))}
      {total > folders.length ? (
        <Text style={panelStyles.muted}>and {total - folders.length} more.</Text>
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
