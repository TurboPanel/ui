import { StyleSheet, Text, View } from 'react-native'
import { FormField, SegmentedControl, TextField, Toggle } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  FOLDER_NAME_RULE_TEXT,
  folderNameProblem,
  suggestFolderName,
  type FolderNameDraft,
} from '@/lib/directory-names'
import { useDirectoryNamesMode } from '@/lib/queries/folders'
import { useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

const KIND_OPTIONS = [
  { value: 'slug', label: 'Readable name' },
  { value: 'uuid', label: 'Id' },
] as const

/**
 * Folder name and "shared across environments" for a new service or volume.
 * What shows depends on the organization's folder naming: readable names show
 * a name box, ids show a note, and "choose for each" shows both. Both choices
 * are final once the first folder exists on a server, so the form says so.
 */
export function FolderNameFields({
  orgId,
  noun,
  nameHint,
  draft,
  onChange,
  disabled = false,
}: Readonly<{
  orgId: string
  noun: 'service' | 'volume'
  /** The item's display name, used to show the name that will be picked when the box is empty. */
  nameHint: string
  draft: FolderNameDraft
  onChange: (next: FolderNameDraft) => void
  disabled?: boolean
}>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const mode = useDirectoryNamesMode(orgId, canManage)
  const typedAllowed = mode === 'slug' || (mode === 'both' && draft.kind === 'slug')
  const problem = typedAllowed ? folderNameProblem(draft.name) : null
  const suggestion = suggestFolderName(nameHint)
  return (
    <View style={styles.root}>
      {mode === 'both' ? (
        <FormField label="Folder name">
          <SegmentedControl
            options={KIND_OPTIONS}
            value={draft.kind}
            disabled={disabled}
            onChange={(kind) => onChange({ ...draft, kind })}
            accessibilityLabel="Folder name kind"
          />
        </FormField>
      ) : null}
      {typedAllowed ? (
        <TextField
          label={mode === 'both' ? 'Readable name' : 'Folder name'}
          value={draft.name}
          onChangeText={(name) => onChange({ ...draft, name })}
          placeholder={suggestion || 'data'}
          editable={!disabled}
          autoCapitalize="none"
          error={problem}
        />
      ) : (
        <Text style={panelStyles.muted}>
          This organization names folders by id, so the {noun}&apos;s folder is named after its id.
        </Text>
      )}
      {typedAllowed ? (
        <Text style={panelStyles.muted}>
          Leave empty to use {suggestion ? `“${suggestion}”` : 'a name made from the name above'}.{' '}
          {FOLDER_NAME_RULE_TEXT} It cannot change once the {noun} has a folder on a server.
        </Text>
      ) : null}
      <FormField label="Shared across environments">
        <Toggle
          value={draft.common}
          disabled={disabled}
          accessibilityLabel={`Share this ${noun} across environments`}
          onValueChange={() => onChange({ ...draft, common: !draft.common })}
        />
      </FormField>
      <Text style={panelStyles.muted}>
        {draft.common
          ? `This ${noun} goes in the Hosting Account's shared folder, so it does not depend on an environment's name and other environments can use it. This cannot change later.`
          : `This ${noun} goes in a folder named after its environment. This cannot change later.`}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
})
