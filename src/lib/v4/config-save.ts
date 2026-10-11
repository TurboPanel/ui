/**
 * Saving the staged edits of the Configuration tab: load fresh data, plan the
 * steps (`planSave`), run them in order, and say which edits are still unsaved
 * if one step fails. The network is passed in, so this stays testable.
 */

import type { ComposeDocument } from '@/lib/instance-api'
import {
  planSave,
  remainingEdits,
  type SaveContext,
  type SaveProblem,
  type StagedEdit,
  type VariableOp,
} from './config-edits'

export type SaveDeps = Readonly<{
  /** Fresh project, environment and variable data (never cached copies). */
  load: () => Promise<SaveContext>
  saveProjectCompose: (document: ComposeDocument) => Promise<unknown>
  saveEnvironmentCompose: (document: ComposeDocument) => Promise<unknown>
  runVariable: (op: VariableOp) => Promise<unknown>
}>

export type SaveOutcome = Readonly<{
  /** Edits that were not saved and stay staged. */
  remaining: readonly StagedEdit[]
  /** Edits that could not be applied to what the server has now. */
  problems: readonly SaveProblem[]
  error: string | null
  /** Number of saves that went through. */
  saved: number
}>

const FAILED = 'Could not save these changes.'

function messageOf(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : FAILED
}

/** Save every staged edit, stopping at the first save that fails. */
export async function saveEdits(
  edits: readonly StagedEdit[],
  deps: SaveDeps
): Promise<SaveOutcome> {
  let context: SaveContext
  try {
    context = await deps.load()
  } catch (error) {
    return { remaining: edits, problems: [], error: messageOf(error), saved: 0 }
  }
  const plan = planSave(edits, context)
  if (plan.problems.length > 0) {
    return {
      remaining: edits,
      problems: plan.problems,
      error: 'Some changes no longer fit what is saved. Undo them and try again.',
      saved: 0,
    }
  }
  let saved = 0
  for (const step of plan.steps) {
    try {
      if (step.kind === 'project-compose') await deps.saveProjectCompose(step.document)
      else if (step.kind === 'environment-compose') await deps.saveEnvironmentCompose(step.document)
      else await deps.runVariable(step.op)
    } catch (error) {
      return {
        remaining: remainingEdits(edits, plan.steps, saved),
        problems: [],
        error: messageOf(error),
        saved,
      }
    }
    saved += 1
  }
  return { remaining: [], problems: [], error: null, saved }
}
