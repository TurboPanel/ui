import { useCallback, useState } from 'react'
import type { ApiMutationResult } from '@/lib/query-client'
import { stageEdit, unstageEdit, type SaveProblem, type StagedEdit } from '@/lib/v4/config-edits'
import type { SaveOutcome } from '@/lib/v4/config-save'
import { useLeaveWarning } from '@/components/ui/use-leave-warning'
import { failedRunMessage } from '@/lib/user-error'

const NOT_SAVED = 'Could not save these changes.'

type Saver = Readonly<{
  run: (edits: readonly StagedEdit[]) => Promise<ApiMutationResult<SaveOutcome>>
  actionError: string | null
  isPending?: boolean
}>

/** Why one edit saved on its own did not go through, or null when it did. */
function saveNowProblem(result: ApiMutationResult<SaveOutcome>): string | null {
  if (!result.ok) return failedRunMessage(result, NOT_SAVED)
  const { error, problems, remaining } = result.value
  if (error !== null) return error
  if (problems.length > 0) return problems.map((problem) => problem.reason).join(' ')
  return remaining.length > 0 ? NOT_SAVED : null
}

/**
 * The unsaved edits of one screen (an environment's Configuration tab or the
 * Base): stage, undo, discard, and Save changes, keeping whatever did not save.
 * A new variable is saved on its own straight away (`saveNow`), like every
 * other Add in the panel. While edits are unsaved or a save is running, the
 * browser asks before the page is left.
 */
export function useStagedEdits(save: Saver) {
  const [staged, setStaged] = useState<readonly StagedEdit[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [problems, setProblems] = useState<readonly SaveProblem[]>([])
  const [savedCount, setSavedCount] = useState(0)

  const stage = useCallback((edit: StagedEdit) => {
    setStaged((current) => stageEdit(current, edit))
    setSavedCount(0)
  }, [])
  const unstage = useCallback(
    (key: string) => setStaged((current) => unstageEdit(current, key)),
    []
  )
  const discard = useCallback(() => {
    setStaged([])
    setSaveError(null)
    setProblems([])
  }, [])
  const saveAll = useCallback(async () => {
    setSaveError(null)
    setProblems([])
    const result = await save.run(staged)
    if (!result.ok) {
      setSaveError(failedRunMessage(result, NOT_SAVED))
      return
    }
    setStaged(result.value.remaining)
    setProblems(result.value.problems)
    setSaveError(result.value.error)
    setSavedCount(result.value.error === null ? result.value.saved : 0)
  }, [save, staged])

  /** Saves one edit now, apart from the staged ones. Resolves to why it failed, or null. */
  const saveNow = useCallback(
    async (edit: StagedEdit): Promise<string | null> => {
      const result = await save.run([edit])
      const problem = saveNowProblem(result)
      if (problem === null) {
        setStaged((current) => unstageEdit(current, edit.key))
        setSavedCount(1)
      }
      return problem
    },
    [save]
  )

  useLeaveWarning(staged.length > 0 || save.isPending === true)

  return { staged, stage, unstage, discard, saveAll, saveNow, saveError, problems, savedCount }
}
