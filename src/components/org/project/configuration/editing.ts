import type {
  ChangeActions,
  ConfigScope,
  OtherEnvironment,
  StagedEdit,
  VariableFacts,
} from '@/lib/v4/config-edits'
import type { ChangeRowModel } from '@/lib/v4/config-view-model'

/** Everything the Configuration rows need to stage an edit. Absent means read-only. */
export type EditingApi = Readonly<{
  envName: string
  staged: readonly StagedEdit[]
  /** Where an edit goes without asking, or `choose` to show the scope cards. */
  scopeMode: ConfigScope | 'choose'
  others: readonly OtherEnvironment[]
  linuxUserNames: readonly string[]
  variableFacts: (name: string) => VariableFacts | null
  actionsFor: (change: ChangeRowModel) => ChangeActions
  onStage: (edit: StagedEdit) => void
  onUnstage: (key: string) => void
}>
