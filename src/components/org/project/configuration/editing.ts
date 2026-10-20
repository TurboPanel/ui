import type { ChangeActions, StagedEdit, VariableFacts } from '@/lib/v4/config-edits'
import type { ChangeRowModel } from '@/lib/v4/config-view-model'

/** Everything the Configuration rows need to stage an edit. Absent means read-only. */
export type EditingApi = Readonly<{
  envName: string
  staged: readonly StagedEdit[]
  linuxUserNames: readonly string[]
  variableFacts: (name: string) => VariableFacts | null
  actionsFor: (change: ChangeRowModel) => ChangeActions
  onStage: (edit: StagedEdit) => void
  onUnstage: (key: string) => void
}>
