/**
 * Edits on the Configuration tab and what saving them sends.
 *
 * Nothing is saved while a person edits: each edit is *staged* (one per config
 * row key, a later edit of the same row replaces the earlier one) and shown in
 * the pending bar as "N unsaved changes". Save turns the staged edits into
 * steps (see {@link planSave}), the order the control plane needs:
 *
 * 1. this environment's own compose,
 * 2. variables: creates and updates, then deletes.
 *
 * The Base is never written from here; it is edited from the Base tab.
 * Real endpoints only: `PATCH /environments/:id` and the variable routes. Pure: no network, no React.
 */

import { normalizeCompose } from '@/lib/compose/types'
import type { ComposeDocument, CreateVariableBody, VariableRecord } from '@/lib/instance-api'
import {
  composePathFor,
  principalAccessPath,
  removeEnvironmentValue,
  restoreEnvironmentService,
  setEnvironmentValue,
  type ComposePath,
  type EditResult,
} from './config-compose'
import { LINUX_USER_PATH } from './compose-syntax'
import { HIDDEN_VALUE, type ChangeRowModel } from './config-view-model'

/** What a Go back acts on. */
export type EditTarget =
  | Readonly<{ type: 'field'; serviceName: string | null; path: ComposePath }>
  | Readonly<{ type: 'service'; serviceName: string }>
  | Readonly<{ type: 'variable'; name: string }>

type Shown = Readonly<{
  /** The config row key (`svc:web:linuxUser`, `var:API_URL`). */
  key: string
  /** The area word in the pending bar ("Hosting Accounts", "Variables"). */
  area: string
  label: string
  was: string
  now: string
}>

export type StagedEdit = Shown &
  (
    | Readonly<{ kind: 'set-linux-user'; serviceName: string; user: string }>
    | Readonly<{
        kind: 'set-variable'
        name: string
        value: string
        secret: boolean
        forBuild: boolean
        forRuntime: boolean
      }>
    | Readonly<{ kind: 'go-back'; target: EditTarget }>
  )

/** Add an edit; a later edit of the same row replaces the earlier one. */
export function stageEdit(edits: readonly StagedEdit[], edit: StagedEdit): StagedEdit[] {
  return [...edits.filter((item) => item.key !== edit.key), edit]
}

export function unstageEdit(edits: readonly StagedEdit[], key: string): StagedEdit[] {
  return edits.filter((item) => item.key !== key)
}

export function stagedEditFor(edits: readonly StagedEdit[], key: string): StagedEdit | undefined {
  return edits.find((item) => item.key === key)
}

/** The grey line under a row that has an unsaved edit. */
export function stagedNote(edit: StagedEdit): string {
  if (edit.kind === 'go-back') return 'Not saved yet: goes back to the Base value'
  return `Not saved yet: ${edit.now}`
}

/** "1 unsaved change", "3 unsaved changes". */
export function unsavedSummary(count: number): string {
  return `${count} unsaved ${count === 1 ? 'change' : 'changes'}`
}

// --- what each change row can do -------------------------------------------

export type ChangeActions = Readonly<{
  goBack: EditTarget | null
}>

const NO_ACTIONS: ChangeActions = { goBack: null }

function variableActions(
  change: ChangeRowModel,
  envVariables: readonly VariableRecord[]
): ChangeActions {
  const name = change.label
  const own = envVariables.find((item) => item.key === name && item.bindingId === null)
  if (own === undefined) return NO_ACTIONS
  const target: EditTarget = { type: 'variable', name }
  return { goBack: target }
}

function fieldTarget(change: ChangeRowModel): EditTarget | null {
  if (change.key.startsWith('user:')) {
    return {
      type: 'field',
      serviceName: null,
      path: principalAccessPath(change.key.slice('user:'.length)),
    }
  }
  const path = composePathFor(change.field)
  if (path === null || change.serviceName === null) return null
  return { type: 'field', serviceName: change.serviceName, path }
}

/**
 * Go back to Base and Make this the Base, for the rows where they can be done.
 * An environment that stands alone owns its apps whole, so only its variables
 * can go back to the Base.
 */
export function changeActions(
  change: ChangeRowModel,
  envVariables: readonly VariableRecord[],
  standsAlone: boolean
): ChangeActions {
  if (change.area === 'variable') return variableActions(change, envVariables)
  if (change.area === 'domain' || standsAlone) return NO_ACTIONS
  if (change.field === null && !change.key.startsWith('user:')) {
    if (change.kind === 'removed' && change.serviceName !== null) {
      return { goBack: { type: 'service', serviceName: change.serviceName } }
    }
    return NO_ACTIONS
  }
  const target = fieldTarget(change)
  if (target === null) return NO_ACTIONS
  return { goBack: target }
}

/** The staged edit for a Go back to Base press. */
export function goBackEdit(change: ChangeRowModel, target: EditTarget): StagedEdit {
  return {
    kind: 'go-back',
    key: change.key,
    area: areaWord(change),
    label: change.label,
    was: change.envText,
    now: `${change.baseText} (Base)`,
    target,
  }
}

function areaWord(change: ChangeRowModel): string {
  if (change.area === 'variable') return 'Variables'
  if (change.area === 'linuxUser') return 'Hosting Accounts'
  return change.serviceName ?? 'Apps'
}

/** What the editors need to know about one variable, or `null` when it is not set anywhere. */
export type VariableFacts = Readonly<{
  /** The starting text of the editor; empty for a secret. */
  value: string
  secret: boolean
  forBuild: boolean
  forRuntime: boolean
  /** The environment has its own value (not only the project's). */
  hasOwn: boolean
  /** A service binding owns it, so it is not edited here. */
  editable: boolean
}>

export function variableFacts(
  name: string,
  environmentVariables: readonly VariableRecord[],
  projectVariables: readonly VariableRecord[]
): VariableFacts | null {
  const own = environmentVariables.find((item) => item.key === name)
  const shared = projectVariables.find((item) => item.key === name)
  const record = own ?? shared
  if (record === undefined) return null
  const bound = own?.bindingId != null || shared?.bindingId != null
  return {
    value: record.isSecret ? '' : (record.value ?? ''),
    secret: record.isSecret,
    forBuild: record.forBuild,
    forRuntime: record.forRuntime,
    hasOwn: own !== undefined,
    editable: !bound,
  }
}

// --- staged edits for the row editors --------------------------------------

export function linuxUserEdit(
  input: Readonly<{
    serviceName: string
    user: string
    was: string
  }>
): StagedEdit {
  return {
    kind: 'set-linux-user',
    key: `svc:${input.serviceName}:linuxUser`,
    area: 'Hosting Accounts',
    label: `${input.serviceName} runs as`,
    was: input.was === '' ? 'Not set' : input.was,
    now: input.user,
    serviceName: input.serviceName,
    user: input.user,
  }
}

/** Where a variable is available: while the app runs, while it builds, or both. */
export type VariableUse = 'run' | 'build' | 'both'

/**
 * Names the framework bakes into the built bundle (`NEXT_PUBLIC_*`) are read at
 * build time, so they default to both; everything else defaults to run only.
 */
export function defaultVariableUse(name: string): VariableUse {
  return name.trim().startsWith('NEXT_PUBLIC_') ? 'both' : 'run'
}

export function variableUseFlags(use: VariableUse): { forBuild: boolean; forRuntime: boolean } {
  return { forBuild: use !== 'run', forRuntime: use !== 'build' }
}

export function variableEdit(
  input: Readonly<{
    name: string
    value: string
    secret: boolean
    forBuild: boolean
    forRuntime: boolean
    was: string
  }>
): StagedEdit {
  return {
    kind: 'set-variable',
    key: `var:${input.name}`,
    area: 'Variables',
    label: input.name,
    was: input.was,
    now: input.secret ? HIDDEN_VALUE : input.value,
    name: input.name,
    value: input.value,
    secret: input.secret,
    forBuild: input.forBuild,
    forRuntime: input.forRuntime,
  }
}

// --- saving ----------------------------------------------------------------

export type VariableOp =
  | Readonly<{ type: 'create'; body: CreateVariableBody }>
  | Readonly<{ type: 'update'; id: string; body: { value: string } }>
  | Readonly<{ type: 'delete'; id: string }>

export type SaveStep =
  | Readonly<{
      kind: 'environment-compose'
      document: ComposeDocument
      editKeys: readonly string[]
    }>
  | Readonly<{ kind: 'variable'; op: VariableOp; editKeys: readonly string[] }>

export type SaveProblem = Readonly<{ key: string; reason: string }>

export type SavePlan = Readonly<{ steps: readonly SaveStep[]; problems: readonly SaveProblem[] }>

export type SaveContext = Readonly<{
  projectId: string
  environmentId: string
  /** Fresh from the server, never from the cache. */
  projectCompose: unknown
  environmentCompose: unknown
  projectVariables: readonly VariableRecord[]
  environmentVariables: readonly VariableRecord[]
}>

type Working = {
  project: unknown
  environment: unknown
  environmentKeys: Set<string>
  ops: { op: VariableOp; key: string }[]
  problems: SaveProblem[]
}

function findVariable(list: readonly VariableRecord[], name: string): VariableRecord | undefined {
  return list.find((item) => item.key === name && item.bindingId === null)
}

function takeEnvironment(work: Working, key: string, result: EditResult) {
  if (!result.ok) {
    work.problems.push({ key, reason: result.reason })
    return
  }
  work.environment = result.document
  work.environmentKeys.add(key)
}

function targetFor(target: Extract<EditTarget, { type: 'field' }>) {
  return { serviceName: target.serviceName }
}

function applyGoBack(work: Working, edit: StagedEdit & { kind: 'go-back' }, ctx: SaveContext) {
  const { target } = edit
  if (target.type === 'field') {
    takeEnvironment(
      work,
      edit.key,
      removeEnvironmentValue({
        projectCompose: work.project,
        environmentCompose: work.environment,
        target: targetFor(target),
        path: target.path,
      })
    )
  } else if (target.type === 'service') {
    takeEnvironment(work, edit.key, restoreEnvironmentService(work.environment, target.serviceName))
  } else {
    const own = findVariable(ctx.environmentVariables, target.name)
    if (own === undefined)
      work.problems.push({
        key: edit.key,
        reason: `${target.name} is no longer set in this environment.`,
      })
    else work.ops.push({ key: edit.key, op: { type: 'delete', id: own.id } })
  }
}

function applyLinuxUser(work: Working, edit: StagedEdit & { kind: 'set-linux-user' }) {
  takeEnvironment(
    work,
    edit.key,
    setEnvironmentValue({
      projectCompose: work.project,
      environmentCompose: work.environment,
      target: { serviceName: edit.serviceName },
      path: LINUX_USER_PATH,
      value: edit.user,
    })
  )
}

function applyVariable(
  work: Working,
  edit: StagedEdit & { kind: 'set-variable' },
  ctx: SaveContext
) {
  const own = findVariable(ctx.environmentVariables, edit.name)
  const shared = findVariable(ctx.projectVariables, edit.name)
  const flags = {
    secret: shared?.isSecret ?? own?.isSecret ?? edit.secret,
    forBuild: shared?.forBuild ?? edit.forBuild,
    forRuntime: shared?.forRuntime ?? edit.forRuntime,
  }
  if (own === undefined) {
    work.ops.push({
      key: edit.key,
      op: {
        type: 'create',
        body: {
          environmentId: ctx.environmentId,
          key: edit.name,
          value: edit.value,
          isSecret: flags.secret,
          forBuild: flags.forBuild,
          forRuntime: flags.forRuntime,
        },
      },
    })
  } else {
    work.ops.push({
      key: edit.key,
      op: { type: 'update', id: own.id, body: { value: edit.value } },
    })
  }
}

function sameDocument(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeCompose(a).data) === JSON.stringify(normalizeCompose(b).data)
}

/**
 * Turn staged edits into the saves they need, from fresh server data.
 * An edit that cannot be applied (the row changed since) comes back as a
 * problem and nothing is planned for it; saving stops while problems exist.
 */
export function planSave(edits: readonly StagedEdit[], ctx: SaveContext): SavePlan {
  const work: Working = {
    project: ctx.projectCompose,
    environment: ctx.environmentCompose,
    environmentKeys: new Set(),
    ops: [],
    problems: [],
  }
  for (const edit of edits) {
    if (edit.kind === 'go-back') applyGoBack(work, edit, ctx)
    else if (edit.kind === 'set-linux-user') applyLinuxUser(work, edit)
    else applyVariable(work, edit, ctx)
  }
  if (work.problems.length > 0) return { steps: [], problems: work.problems }
  const steps: SaveStep[] = []
  if (!sameDocument(work.environment, ctx.environmentCompose)) {
    steps.push({
      kind: 'environment-compose',
      document: normalizeCompose(work.environment),
      editKeys: [...work.environmentKeys],
    })
  }
  const writes = work.ops.filter((item) => item.op.type !== 'delete')
  const deletes = work.ops.filter((item) => item.op.type === 'delete')
  for (const item of [...writes, ...deletes]) {
    steps.push({ kind: 'variable', op: item.op, editKeys: [item.key] })
  }
  return { steps, problems: [] }
}

/** Edits that still have a step to run after `completed` steps went through. */
export function remainingEdits(
  edits: readonly StagedEdit[],
  steps: readonly SaveStep[],
  completed: number
): StagedEdit[] {
  const pending = new Set(steps.slice(completed).flatMap((step) => step.editKeys))
  return edits.filter((edit) => pending.has(edit.key))
}
