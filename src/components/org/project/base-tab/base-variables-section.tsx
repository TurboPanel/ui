import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { VariablesSection } from '@/components/org/project/configuration/config-sections'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import { SaveBar } from '@/components/org/project/configuration/save-bar'
import { useStagedEdits } from '@/components/org/project/configuration/use-staged-edits'
import { useProjectContext } from '@/components/org/project/project-context'
import { Notice } from '@/components/ui/v4'
import { useSaveBaseVariables } from '@/lib/queries/configuration'
import { useVariables } from '@/lib/queries/variables'
import { variableFacts } from '@/lib/v4/config-edits'
import type { BaseVariableRow } from '@/lib/v4/project-base'

const BASE_NAME = 'the Base'

const NO_ACTIONS = { goBack: null }

const styles = StyleSheet.create({ stack: { gap: 16 } })

/**
 * Variables set on the project: every environment gets them. The same editor
 * as an environment's Configuration tab (add, edit the value and where it is
 * used, remove), staged until Save changes. Secret values are never shown.
 */
export function BaseVariablesSection({ rows }: Readonly<{ rows: readonly BaseVariableRow[] }>) {
  const { orgId, projectId, canOwn, projectAllowsMutations } = useProjectContext()
  const projectVariables = useVariables(orgId, { projectId })
  const save = useSaveBaseVariables(orgId, projectId)
  const { staged, stage, unstage, discard, saveAll, saveError, problems, savedCount } =
    useStagedEdits(save)
  const records = projectVariables.data?.variables
  const editable = canOwn && projectAllowsMutations
  const editing = useMemo<EditingApi | undefined>(() => {
    if (!editable || !records) return undefined
    return {
      envName: BASE_NAME,
      staged,
      linuxUserNames: [],
      variableFacts: (name) => variableFacts(name, records, []),
      actionsFor: () => NO_ACTIONS,
      onStage: stage,
      onUnstage: unstage,
      base: true,
    }
  }, [editable, records, staged, stage, unstage])
  return (
    <View style={styles.stack}>
      {savedCount > 0 && staged.length === 0 ? (
        <Notice
          tone="ok"
          title="Saved"
          body="Each environment gets the change on its next deploy."
        />
      ) : null}
      <VariablesSection
        variables={rows}
        envName={BASE_NAME}
        editing={editing}
        title="Project variables"
        foot="Shared by every environment. An environment can set its own value. Secret values are never shown."
        empty={{
          title: 'No project variables',
          body: 'Nothing is shared by every environment yet.',
        }}
      />
      <SaveBar
        edits={staged}
        envName={BASE_NAME}
        saving={save.isPending}
        error={saveError}
        problems={problems}
        onSave={() => void saveAll()}
        onDiscard={discard}
        onUndo={unstage}
      />
    </View>
  )
}
