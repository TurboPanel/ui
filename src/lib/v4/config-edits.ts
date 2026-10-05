/**
 * Edits on the Configuration tab and what saving them sends.
 *
 * Nothing is saved while a person edits: each edit is *staged* (one per config
 * row key, a later edit of the same row replaces the earlier one) and shown in
 * the pending bar as "N unsaved changes". Save turns the staged edits into
 * steps (see {@link planSave}), the order the control plane needs:
 *
 * 1. the Base (project compose), so "Make this the Base" never leaves a gap,
 * 2. this environment's own compose,
 * 3. variables: creates and updates, then deletes.
 *
 * Real endpoints only: `PATCH /projects/:id`, `PATCH /environments/:id` and the
 * variable routes. Pure: no network, no React.
 */

import { normalizeCompose } from '@/lib/compose/types'
import type { ComposeDocument, CreateVariableBody, VariableRecord } from '@/lib/instance-api'
import {
  composePathFor,
  makeValueTheBase,
  principalAccessPath,
  removeEnvironmentValue,
  restoreEnvironmentService,
  setEnvironmentValue,
  setValueInBase,
  type ComposePath,
  type EditResult,
  type MakeBaseResult,
} from './config-compose'
import { LINUX_USER_PATH, servicesAreDetached } from './compose-syntax'
import { HIDDEN_VALUE, type ChangeRowModel } from './config-view-model'
import { joinNames } from './text'

export type ConfigScope = 'environment' | 'base'

/** What a Go back / Make this the Base acts on. */
export type EditTarget =
  | Readonly<{ type: 'field'; serviceName: string | null; path: ComposePath }>
  | Readonly<{ type: 'service'; serviceName: string }>
  | Readonly<{ type: 'variable'; name: string }>

type Shown = Readonly<{
  /** The config row key (`svc:web:linuxUser`, `var:API_URL`). */
  key: string
  /** The area word in the pending bar ("Linux users", "Variables"). */
  area: string
  label: string
  was: string
  now: string
}>

export type StagedEdit = Shown &
  (
    | Readonly<{ kind: 'set-linux-user'; serviceName: string; user: string; scope: ConfigScope }>
    | Readonly<{
        kind: 'set-variable'
        name: string
        value: string
        secret: boolean
        forBuild: boolean
        forRuntime: boolean
        scope: ConfigScope
      }>
    | Readonly<{ kind: 'go-back'; target: EditTarget }>
    | Readonly<{ kind: 'make-base'; target: EditTarget }>
  )

/** Add an edit; a later edit of the same row replaces the earlier one. */
export function stageEdit(edits: readonly StagedEdit[], edit: StagedEdit): StagedEdit[] {
  return [...edits.filter((item) => item.key !== edit.key), edit]
}

export function unstageEdit(edits: readonly StagedEdit[], key: string): StagedEdit[] {
  return edits.filter((item) => item.key !== key)
}

export function stagedEditFor(
  edits: readonly StagedEdit[],
  key: string
): StagedEdit | undefined {
  return edits.find((item) => item.key === key)
}

/** The grey line under a row that has an unsaved edit. */
export function stagedNote(edit: StagedEdit): string {
  if (edit.kind === 'go-back') return 'Not saved yet: goes back to the Base value'
  if (edit.kind === 'make-base') return 'Not saved yet: moves into the Base'
  return `Not saved yet: ${edit.now}`
}

/** "1 unsaved change", "3 unsaved changes". */
export function unsavedSummary(count: number): string {
  return `${count} unsaved ${count === 1 ? 'change' : 'changes'}`
}

// --- scope choice ----------------------------------------------------------

export type OtherEnvironment = Readonly<{ name: string; standsAlone: boolean }>

/**
 * Whether an environment is cut off from the Base. This is the control plane's
 * rule (`services: !override` or `!reset` in its own compose), so the tab
 * agrees with `followsBase` in the config-view answer. Note that
 * `follows-base.ts` counts a `!reset` of all services as following the Base.
 */
export function environmentDetachedFromBase(environmentCompose: unknown): boolean {
  return servicesAreDetached(normalizeCompose(environmentCompose).data.services)
}

/**
 * Where an edit goes without asking:
 * - one environment in the project: the Base (there is nothing else to change),
 * - an environment that stands alone: that environment (the Base does not reach it),
 * - otherwise the person chooses.
 */
export function scopeDecision(
  environmentCount: number,
  followsBase: boolean
): ConfigScope | 'choose' {
  if (environmentCount <= 1) return 'base'
  return followsBase ? 'choose' : 'environment'
}

export type ScopeChoice = Readonly<{ scope: ConfigScope; title: string; body: string }>

function verb(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

/** The two radio cards, each naming the environments it reaches. */
export function scopeChoices(input: Readonly<{
  envName: string
  others: readonly OtherEnvironment[]
  /** This environment already has its own value for the row. */
  hasOwnChange: boolean
}>): ScopeChoice[] {
  const { envName, others, hasOwnChange } = input
  const followers = [envName, ...others.filter((item) => !item.standsAlone).map((item) => item.name)]
  const alone = others.filter((item) => item.standsAlone).map((item) => item.name)
  const keepers = others.filter((item) => !item.standsAlone).map((item) => item.name)
  let only = `Adds a ${envName} change.`
  if (keepers.length > 0) {
    only += ` ${joinNames(keepers)} ${verb(keepers.length, 'keeps', 'keep')} the Base value.`
  }
  let base = `${joinNames(followers)} ${verb(followers.length, 'gets', 'get')} it on the next deploy.`
  if (alone.length > 0) {
    base += ` ${joinNames(alone)} ${verb(alone.length, 'stands alone and won’t', 'stand alone and won’t')} change.`
  }
  if (hasOwnChange) base += ` ${envName}’s own change is removed.`
  return [
    { scope: 'environment', title: `${envName} only`, body: only },
    { scope: 'base', title: 'Base, for every environment that follows it', body: base },
  ]
}

/** The confirm text for Make this the Base. */
export function makeBaseConfirmText(
  envName: string,
  others: readonly OtherEnvironment[]
): string {
  const reached = others.filter((item) => !item.standsAlone).map((item) => item.name)
  const tail = `${envName}’s own change is removed, so it keeps running the same value.`
  if (reached.length === 0) return `Moves this value into the Base. ${tail}`
  return `${joinNames(reached)} ${verb(reached.length, 'follows', 'follow')} the Base and would get this value on the next deploy. ${tail}`
}

// --- what each change row can do -------------------------------------------

export type ChangeActions = Readonly<{
  goBack: EditTarget | null
  makeBase: EditTarget | null
}>

const NO_ACTIONS: ChangeActions = { goBack: null, makeBase: null }

function variableActions(
  change: ChangeRowModel,
  envVariables: readonly VariableRecord[]
): ChangeActions {
  const name = change.label
  const own = envVariables.find((item) => item.key === name && item.bindingId === null)
  if (own === undefined) return NO_ACTIONS
  const target: EditTarget = { type: 'variable', name }
  const movable = !own.isSecret && own.value !== null && !change.masked
  return { goBack: target, makeBase: movable ? target : null }
}

function fieldTarget(change: ChangeRowModel): EditTarget | null {
  if (change.key.startsWith('user:')) {
    return { type: 'field', serviceName: null, path: principalAccessPath(change.key.slice('user:'.length)) }
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
  followsBase: boolean
): ChangeActions {
  if (change.area === 'variable') return variableActions(change, envVariables)
  if (change.area === 'domain' || !followsBase) return NO_ACTIONS
  if (change.field === null && !change.key.startsWith('user:')) {
    if (change.kind === 'removed' && change.serviceName !== null) {
      return { goBack: { type: 'service', serviceName: change.serviceName }, makeBase: null }
    }
    return NO_ACTIONS
  }
  const target = fieldTarget(change)
  if (target === null) return NO_ACTIONS
  const movable = change.kind !== 'removed' && !change.masked
  return { goBack: target, makeBase: movable ? target : null }
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

/** The staged edit for a Make this the Base press. */
export function makeBaseEdit(change: ChangeRowModel, target: EditTarget): StagedEdit {
  return {
    kind: 'make-base',
    key: change.key,
    area: areaWord(change),
    label: change.label,
    was: change.baseText,
    now: `${change.envText} (Base)`,
    target,
  }
}

function areaWord(change: ChangeRowModel): string {
  if (change.area === 'variable') return 'Variables'
  if (change.area === 'linuxUser') return 'Linux users'
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

export function linuxUserEdit(input: Readonly<{
  serviceName: string
  user: string
  was: string
  scope: ConfigScope
}>): StagedEdit {
  return {
    kind: 'set-linux-user',
    key: `svc:${input.serviceName}:linuxUser`,
    area: 'Linux users',
    label: `${input.serviceName} runs as`,
    was: input.was === '' ? 'Not set' : input.was,
    now: input.user,
    serviceName: input.serviceName,
    user: input.user,
    scope: input.scope,
  }
}

export function variableEdit(input: Readonly<{
  name: string
  value: string
  secret: boolean
  forBuild: boolean
  forRuntime: boolean
  was: string
  scope: ConfigScope
}>): StagedEdit {
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
    scope: input.scope,
  }
}

// --- saving ----------------------------------------------------------------

export type VariableOp =
  | Readonly<{ type: 'create'; body: CreateVariableBody }>
  | Readonly<{ type: 'update'; id: string; body: { value: string } }>
  | Readonly<{ type: 'delete'; id: string }>

export type SaveStep =
  | Readonly<{ kind: 'project-compose'; document: ComposeDocument; editKeys: readonly string[] }>
  | Readonly<{ kind: 'environment-compose'; document: ComposeDocument; editKeys: readonly string[] }>
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
  projectKeys: Set<string>
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

function takeBoth(work: Working, key: string, result: MakeBaseResult) {
  if (!result.ok) {
    work.problems.push({ key, reason: result.reason })
    return
  }
  work.project = result.projectCompose
  work.environment = result.environmentCompose
  work.projectKeys.add(key)
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
    if (own === undefined) work.problems.push({ key: edit.key, reason: `${target.name} is no longer set in this environment.` })
    else work.ops.push({ key: edit.key, op: { type: 'delete', id: own.id } })
  }
}

function projectVariableBody(
  ctx: SaveContext,
  name: string,
  value: string,
  flags: Readonly<{ secret: boolean; forBuild: boolean; forRuntime: boolean }>
): CreateVariableBody {
  return {
    projectId: ctx.projectId,
    key: name,
    value,
    isSecret: flags.secret,
    forBuild: flags.forBuild,
    forRuntime: flags.forRuntime,
  }
}

function applyMakeBase(work: Working, edit: StagedEdit & { kind: 'make-base' }, ctx: SaveContext) {
  const { target } = edit
  if (target.type === 'field') {
    takeBoth(
      work,
      edit.key,
      makeValueTheBase({
        projectCompose: work.project,
        environmentCompose: work.environment,
        target: targetFor(target),
        path: target.path,
      })
    )
    return
  }
  if (target.type === 'service') {
    work.problems.push({ key: edit.key, reason: `${target.serviceName} cannot be moved into the Base from here.` })
    return
  }
  const own = findVariable(ctx.environmentVariables, target.name)
  if (own === undefined || own.isSecret || own.value === null) {
    work.problems.push({ key: edit.key, reason: `${target.name} has no value that can move into the Base.` })
    return
  }
  const shared = findVariable(ctx.projectVariables, target.name)
  if (shared === undefined) {
    const flags = { secret: false, forBuild: own.forBuild, forRuntime: own.forRuntime }
    work.ops.push({ key: edit.key, op: { type: 'create', body: projectVariableBody(ctx, target.name, own.value, flags) } })
  } else {
    work.ops.push({ key: edit.key, op: { type: 'update', id: shared.id, body: { value: own.value } } })
  }
  work.ops.push({ key: edit.key, op: { type: 'delete', id: own.id } })
}

function applyLinuxUser(work: Working, edit: StagedEdit & { kind: 'set-linux-user' }) {
  const target = { serviceName: edit.serviceName }
  if (edit.scope === 'environment') {
    takeEnvironment(
      work,
      edit.key,
      setEnvironmentValue({
        projectCompose: work.project,
        environmentCompose: work.environment,
        target,
        path: LINUX_USER_PATH,
        value: edit.user,
      })
    )
    return
  }
  takeBoth(
    work,
    edit.key,
    setValueInBase({
      projectCompose: work.project,
      environmentCompose: work.environment,
      target,
      path: LINUX_USER_PATH,
      value: edit.user,
    })
  )
}

function applyVariable(work: Working, edit: StagedEdit & { kind: 'set-variable' }, ctx: SaveContext) {
  const own = findVariable(ctx.environmentVariables, edit.name)
  const shared = findVariable(ctx.projectVariables, edit.name)
  const flags = {
    secret: shared?.isSecret ?? own?.isSecret ?? edit.secret,
    forBuild: shared?.forBuild ?? edit.forBuild,
    forRuntime: shared?.forRuntime ?? edit.forRuntime,
  }
  const push = (op: VariableOp) => work.ops.push({ key: edit.key, op })
  if (edit.scope === 'environment') {
    if (own === undefined) {
      push({
        type: 'create',
        body: {
          environmentId: ctx.environmentId,
          key: edit.name,
          value: edit.value,
          isSecret: flags.secret,
          forBuild: flags.forBuild,
          forRuntime: flags.forRuntime,
        },
      })
    } else {
      push({ type: 'update', id: own.id, body: { value: edit.value } })
    }
    return
  }
  if (shared === undefined) push({ type: 'create', body: projectVariableBody(ctx, edit.name, edit.value, flags) })
  else push({ type: 'update', id: shared.id, body: { value: edit.value } })
  if (own !== undefined) push({ type: 'delete', id: own.id })
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
    projectKeys: new Set(),
    environmentKeys: new Set(),
    ops: [],
    problems: [],
  }
  for (const edit of edits) {
    if (edit.kind === 'go-back') applyGoBack(work, edit, ctx)
    else if (edit.kind === 'make-base') applyMakeBase(work, edit, ctx)
    else if (edit.kind === 'set-linux-user') applyLinuxUser(work, edit)
    else applyVariable(work, edit, ctx)
  }
  if (work.problems.length > 0) return { steps: [], problems: work.problems }
  const steps: SaveStep[] = []
  if (!sameDocument(work.project, ctx.projectCompose)) {
    steps.push({ kind: 'project-compose', document: normalizeCompose(work.project), editKeys: [...work.projectKeys] })
  }
  if (!sameDocument(work.environment, ctx.environmentCompose)) {
    steps.push({ kind: 'environment-compose', document: normalizeCompose(work.environment), editKeys: [...work.environmentKeys] })
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
