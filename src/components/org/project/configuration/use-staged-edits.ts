import { useCallback, useState } from 'react'
import type { ApiMutationResult } from '@/lib/query-client'
import { stageEdit, unstageEdit, type SaveProblem, type StagedEdit } from '@/lib/v4/config-edits'
import type { SaveOutcome } from '@/lib/v4/config-save'

type Saver = Readonly<{
  run: (edits: readonly StagedEdit[]) => Promise<ApiMutationResult<SaveOutcome>>
  actionError: string | null
}>

/**
 * The unsaved edits of one screen (an environment's Configuration tab or the
 * Base): stage, undo, discard, and Save changes, keeping whatever did not save.
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
      setSaveError(save.actionError ?? 'Could not save these changes.')
      return
    }
    setStaged(result.value.remaining)
    setProblems(result.value.problems)
    setSaveError(result.value.error)
    setSavedCount(result.value.error === null ? result.value.saved : 0)
  }, [save, staged])

  return { staged, stage, unstage, discard, saveAll, saveError, problems, savedCount }
}
