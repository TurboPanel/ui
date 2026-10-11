import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import { makeComposeTag } from '@/lib/compose/tags'
import type { VariableRecord } from '@/lib/instance-api'
import { principalAccessPath } from './config-compose'
import {
  changeActions,
  environmentDetachedFromBase,
  goBackEdit,
  linuxUserEdit,
  makeBaseConfirmText,
  makeBaseEdit,
  planSave,
  remainingEdits,
  scopeChoices,
  scopeDecision,
  stageEdit,
  stagedEditFor,
  stagedNote,
  unsavedSummary,
  unstageEdit,
  variableFacts,
  variableEdit,
  type SaveContext,
  type StagedEdit,
} from './config-edits'
import { buildConfigViewModel, type ChangeRowModel } from './config-view-model'
import { stagingView } from './config-view-model.fixtures'

function doc(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: Object.keys(data), comments: {} } }
}

function record(key: string, extra: Partial<VariableRecord> = {}): VariableRecord {
  return {
    id: `id-${key}-${extra.environmentId ?? 'project'}`,
    key,
    isSecret: false,
    isLiteral: true,
    forBuild: false,
    forRuntime: true,
    value: 'v',
    organizationId: null,
    workspaceId: null,
    projectId: null,
    environmentId: null,
    serviceId: null,
    hostingId: null,
    serverId: null,
    bindingId: null,
    description: null,
    createdAt: '',
    updatedAt: '',
    ...extra,
  }
}

const projectCompose = doc({
  services: {
    web: { command: 'npm start', 'x-turbopanel': { serviceKind: 'node', principal: 'website' } },
  },
  'x-turbopanel': { principals: { website: { access: 'sftp' } } },
})

function context(extra: Partial<SaveContext> = {}): SaveContext {
  return {
    projectId: 'p1',
    environmentId: 'e1',
    projectCompose,
    environmentCompose: null,
    projectVariables: [],
    environmentVariables: [],
    ...extra,
  }
}

const changes = buildConfigViewModel({ envName: 'Staging', view: stagingView() }).changes
const byKey = (key: string): ChangeRowModel => changes.find((item) => item.key === key) as ChangeRowModel

describe('staging', () => {
  it('keeps one edit per row, the latest', () => {
    const first = linuxUserEdit({ serviceName: 'web', user: 'a', was: 'website', scope: 'environment' })
    const second = linuxUserEdit({ serviceName: 'web', user: 'b', was: 'website', scope: 'base' })
    const other = variableEdit({ name: 'X', value: '1', secret: false, forBuild: false, forRuntime: true, was: 'Not set', scope: 'base' })
    const staged = stageEdit(stageEdit(stageEdit([], first), other), second)
    expect(staged.map((edit) => edit.key)).toEqual(['var:X', 'svc:web:linuxUser'])
    expect(stagedEditFor(staged, 'svc:web:linuxUser')).toBe(second)
    expect(stagedEditFor(staged, 'nope')).toBeUndefined()
    expect(unstageEdit(staged, 'var:X')).toEqual([second])
  })

  it('says what an unsaved edit will do', () => {
    const change = byKey('svc:web:command')
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    expect(stagedNote(goBackEdit(change, target))).toBe('Not saved yet: goes back to the Base value')
    expect(stagedNote(makeBaseEdit(change, target))).toBe('Not saved yet: moves into the Base')
    expect(stagedNote(linuxUserEdit({ serviceName: 'web', user: 'a', was: '', scope: 'base' }))).toBe(
      'Not saved yet: a'
    )
  })

  it('counts unsaved changes', () => {
    expect(unsavedSummary(1)).toBe('1 unsaved change')
    expect(unsavedSummary(3)).toBe('3 unsaved changes')
  })

  it('shows a secret as Hidden in the pending list', () => {
    expect(
      variableEdit({ name: 'K', value: 'x', secret: true, forBuild: false, forRuntime: true, was: 'Hidden', scope: 'base' }).now
    ).toBe('Hidden')
    expect(linuxUserEdit({ serviceName: 'web', user: 'a', was: '', scope: 'base' }).was).toBe('Not set')
  })
})

describe('scope', () => {
  it('goes to the Base in a one-environment project, here when standing alone, else asks', () => {
    expect(scopeDecision(1, true)).toBe('base')
    expect(scopeDecision(3, false)).toBe('environment')
    expect(scopeDecision(3, true)).toBe('choose')
  })

  it('names the environments each choice reaches', () => {
    const [only, base] = scopeChoices({
      envName: 'Staging',
      others: [
        { name: 'Production', standsAlone: false },
        { name: 'Preview', standsAlone: true },
      ],
      hasOwnChange: false,
    })
    expect(only).toEqual({
      scope: 'environment',
      title: 'Staging only',
      body: 'Adds a Staging change. Production keeps the Base value.',
    })
    expect(base.title).toBe('Base, for every environment that follows it')
    expect(base.body).toBe(
      'Staging and Production get it on the next deploy. Preview stands alone and won’t change.'
    )
  })

  it('handles several environments of each kind, and its own change', () => {
    const [only, base] = scopeChoices({
      envName: 'Staging',
      others: [
        { name: 'A', standsAlone: false },
        { name: 'B', standsAlone: false },
        { name: 'C', standsAlone: true },
        { name: 'D', standsAlone: true },
      ],
      hasOwnChange: true,
    })
    expect(only.body).toBe('Adds a Staging change. A and B keep the Base value.')
    expect(base.body).toBe(
      'Staging, A and B get it on the next deploy. C and D stand alone and won’t change. Staging’s own change is removed.'
    )
  })

  it('has a short text with no other environments', () => {
    const [only, base] = scopeChoices({ envName: 'Staging', others: [], hasOwnChange: false })
    expect(only.body).toBe('Adds a Staging change.')
    expect(base.body).toBe('Staging gets it on the next deploy.')
  })

  it('writes the Make this the Base confirm', () => {
    expect(makeBaseConfirmText('Staging', [])).toBe(
      'Moves this value into the Base. Staging’s own change is removed, so it keeps running the same value.'
    )
    expect(
      makeBaseConfirmText('Staging', [
        { name: 'Production', standsAlone: false },
        { name: 'Preview', standsAlone: true },
        { name: 'Testing', standsAlone: false },
      ])
    ).toBe(
      'Production and Testing follow the Base and would get this value on the next deploy. Staging’s own change is removed, so it keeps running the same value.'
    )
    expect(makeBaseConfirmText('Staging', [{ name: 'Production', standsAlone: false }])).toContain(
      'Production follows the Base'
    )
  })

  it('uses the control plane’s rule for standing alone', () => {
    expect(environmentDetachedFromBase(null)).toBe(false)
    expect(environmentDetachedFromBase(doc({ services: { web: { image: 'x' } } }))).toBe(false)
    expect(environmentDetachedFromBase(doc({ services: makeComposeTag('override', {}) }))).toBe(true)
    expect(environmentDetachedFromBase(doc({ services: makeComposeTag('reset', null) }))).toBe(true)
  })
})

describe('changeActions', () => {
  it('offers both for a field change', () => {
    const actions = changeActions(byKey('svc:web:command'), [], true)
    expect(actions.goBack).toEqual({ type: 'field', serviceName: 'web', path: ['command'] })
    expect(actions.makeBase).toEqual(actions.goBack)
  })

  it('offers only Go back for a removed value and none for a secret to move', () => {
    const removed = { ...byKey('svc:web:command'), kind: 'removed' as const }
    expect(changeActions(removed, [], true)).toMatchObject({ goBack: { type: 'field' }, makeBase: null })
    const masked = { ...byKey('svc:web:command'), masked: true }
    expect(changeActions(masked, [], true)).toMatchObject({ goBack: { type: 'field' }, makeBase: null })
  })

  it('maps a Linux user sign-in change to the root and a user change to the app', () => {
    const access = {
      ...byKey('svc:web:command'),
      key: 'user:website',
      area: 'linuxUser' as const,
      field: 'access',
      serviceName: null,
    }
    expect(changeActions(access, [], true).goBack).toEqual({
      type: 'field',
      serviceName: null,
      path: principalAccessPath('website'),
    })
    expect(changeActions(byKey('svc:web:linuxUser'), [], true).goBack).toEqual({
      type: 'field',
      serviceName: 'web',
      path: ['x-turbopanel', 'principal'],
    })
  })

  it('has nothing for domains, whole apps and settings without a path', () => {
    const domain = { ...byKey('svc:web:command'), area: 'domain' as const, field: 'domain:x' }
    expect(changeActions(domain, [], true)).toEqual({ goBack: null, makeBase: null })
    expect(changeActions(byKey('svc:worker'), [], true)).toEqual({ goBack: null, makeBase: null })
    const kind = { ...byKey('svc:web:command'), field: 'kind' }
    expect(changeActions(kind, [], true)).toEqual({ goBack: null, makeBase: null })
    const noApp = { ...byKey('svc:web:command'), serviceName: null }
    expect(changeActions(noApp, [], true)).toEqual({ goBack: null, makeBase: null })
  })

  it('offers Go back for an app the environment removed', () => {
    const removed = { ...byKey('svc:worker'), kind: 'removed' as const }
    expect(changeActions(removed, [], true)).toEqual({
      goBack: { type: 'service', serviceName: 'worker' },
      makeBase: null,
    })
    expect(changeActions({ ...removed, serviceName: null }, [], true)).toEqual({ goBack: null, makeBase: null })
  })

  it('offers variable actions only for the environment’s own, editable, non-secret values', () => {
    const change = byKey('var:API_URL')
    const own = record('API_URL', { environmentId: 'e1', value: 'x' })
    expect(changeActions(change, [own], true)).toEqual({
      goBack: { type: 'variable', name: 'API_URL' },
      makeBase: { type: 'variable', name: 'API_URL' },
    })
    expect(changeActions(change, [], true)).toEqual({ goBack: null, makeBase: null })
    expect(changeActions(change, [{ ...own, bindingId: 'b1' }], true)).toEqual({ goBack: null, makeBase: null })
    expect(changeActions(change, [{ ...own, isSecret: true, value: null }], true)).toMatchObject({ makeBase: null })
    expect(changeActions({ ...change, masked: true }, [own], true)).toMatchObject({ makeBase: null })
  })

  it('leaves a stand-alone environment only its variables', () => {
    expect(changeActions(byKey('svc:web:command'), [], false)).toEqual({ goBack: null, makeBase: null })
    const own = record('API_URL', { environmentId: 'e1', value: 'x' })
    expect(changeActions(byKey('var:API_URL'), [own], false).goBack).toEqual({ type: 'variable', name: 'API_URL' })
  })

  it('builds the staged edits for both presses', () => {
    const change = byKey('svc:web:command')
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    expect(goBackEdit(change, target)).toMatchObject({
      kind: 'go-back',
      key: 'svc:web:command',
      area: 'web',
      was: 'npm run staging',
      now: 'npm start (Base)',
    })
    expect(makeBaseEdit(change, target)).toMatchObject({
      kind: 'make-base',
      was: 'npm start',
      now: 'npm run staging (Base)',
    })
    expect(goBackEdit(byKey('var:API_URL'), { type: 'variable', name: 'API_URL' }).area).toBe('Variables')
    expect(goBackEdit(byKey('svc:web:linuxUser'), target).area).toBe('Linux users')
    expect(goBackEdit({ ...change, serviceName: null }, target).area).toBe('Apps')
  })
})

describe('planSave', () => {
  it('saves a Linux user for this environment only, as one environment step', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website', scope: 'environment' })
    const plan = planSave([edit], context())
    expect(plan.problems).toEqual([])
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({
      kind: 'environment-compose',
      editKeys: ['svc:web:linuxUser'],
      document: {
        data: {
          services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'staging-web' } } },
        },
      },
    })
  })

  it('saves a Linux user in the Base and drops this environment’s own choice, Base first', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'shared', was: 'staging-web', scope: 'base' })
    const env = doc({ services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'staging-web' } } } })
    const plan = planSave([edit], context({ environmentCompose: env }))
    expect(plan.steps.map((step) => step.kind)).toEqual(['project-compose', 'environment-compose'])
    expect(plan.steps[1]).toMatchObject({ document: { data: {} } })
  })

  it('sends nothing for an edit that changes nothing', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'website', was: 'website', scope: 'base' })
    expect(planSave([edit], context()).steps).toEqual([])
  })

  it('goes back and makes the Base for compose values', () => {
    const env = doc({ services: { web: { command: 'npm run staging' } } })
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    const back = planSave([goBackEdit(byKey('svc:web:command'), target)], context({ environmentCompose: env }))
    expect(back.steps).toHaveLength(1)
    expect(back.steps[0]).toMatchObject({ kind: 'environment-compose', document: { data: {} } })
    const make = planSave([makeBaseEdit(byKey('svc:web:command'), target)], context({ environmentCompose: env }))
    expect(make.steps.map((step) => step.kind)).toEqual(['project-compose', 'environment-compose'])
  })

  it('restores a removed app, and says an app cannot be moved into the Base', () => {
    const env = doc({ services: { worker: makeComposeTag('reset', null) } })
    const service = { type: 'service' as const, serviceName: 'worker' }
    const restore = planSave([goBackEdit(byKey('svc:worker'), service)], context({ environmentCompose: env }))
    expect(restore.steps).toHaveLength(1)
    const move = planSave([makeBaseEdit(byKey('svc:worker'), service)], context())
    expect(move.problems).toEqual([
      { key: 'svc:worker', reason: 'worker cannot be moved into the Base from here.' },
    ])
    expect(move.steps).toEqual([])
  })

  it('reports an edit that no longer fits and plans nothing', () => {
    const target = { type: 'field' as const, serviceName: 'ghost', path: ['command'] }
    const plan = planSave(
      [
        makeBaseEdit(byKey('svc:web:command'), target),
        goBackEdit(byKey('svc:web:linuxUser'), { type: 'service', serviceName: 'web' }),
      ],
      context()
    )
    expect(plan.steps).toEqual([])
    expect(plan.problems.map((item) => item.key)).toEqual(['svc:web:command', 'svc:web:linuxUser'])
  })

  it('creates, updates and deletes variables, deletes last', () => {
    const own = record('API_URL', { environmentId: 'e1', value: 'staging', forBuild: true })
    const shared = record('API_URL', { projectId: 'p1', value: 'live' })
    const target = { type: 'variable' as const, name: 'API_URL' }
    const make = planSave([makeBaseEdit(byKey('var:API_URL'), target)], context({ projectVariables: [shared], environmentVariables: [own] }))
    expect(make.steps.map((step) => (step.kind === 'variable' ? step.op.type : step.kind))).toEqual(['update', 'delete'])
    expect(make.steps[0]).toMatchObject({ op: { id: shared.id, body: { value: 'staging' } } })

    const makeNew = planSave([makeBaseEdit(byKey('var:API_URL'), target)], context({ environmentVariables: [own] }))
    expect(makeNew.steps[0]).toMatchObject({
      op: { type: 'create', body: { projectId: 'p1', key: 'API_URL', value: 'staging', isSecret: false, forBuild: true, forRuntime: true } },
    })

    const back = planSave([goBackEdit(byKey('var:API_URL'), target)], context({ environmentVariables: [own] }))
    expect(back.steps).toEqual([{ kind: 'variable', op: { type: 'delete', id: own.id }, editKeys: ['var:API_URL'] }])
  })

  it('refuses a variable that is gone, a secret, and one with no value', () => {
    const target = { type: 'variable' as const, name: 'API_URL' }
    expect(planSave([goBackEdit(byKey('var:API_URL'), target)], context()).problems).toHaveLength(1)
    expect(planSave([makeBaseEdit(byKey('var:API_URL'), target)], context()).problems).toHaveLength(1)
    const secret = record('API_URL', { environmentId: 'e1', isSecret: true, value: null })
    expect(planSave([makeBaseEdit(byKey('var:API_URL'), target)], context({ environmentVariables: [secret] })).problems).toHaveLength(1)
  })

  it('sets a variable for this environment: updates its own, or creates one like the project’s', () => {
    const edit = variableEdit({ name: 'MODE', value: 'staging', secret: false, forBuild: false, forRuntime: true, was: 'live', scope: 'environment' })
    const own = record('MODE', { environmentId: 'e1' })
    expect(planSave([edit], context({ environmentVariables: [own] })).steps[0]).toMatchObject({
      op: { type: 'update', id: own.id, body: { value: 'staging' } },
    })
    const shared = record('MODE', { projectId: 'p1', isSecret: true, forBuild: true, forRuntime: false })
    expect(planSave([edit], context({ projectVariables: [shared] })).steps[0]).toMatchObject({
      op: {
        type: 'create',
        body: { environmentId: 'e1', key: 'MODE', value: 'staging', isSecret: true, forBuild: true, forRuntime: false },
      },
    })
    expect(planSave([edit], context()).steps[0]).toMatchObject({
      op: { type: 'create', body: { isSecret: false, forBuild: false, forRuntime: true } },
    })
  })

  it('sets a variable in the Base and removes this environment’s own value', () => {
    const edit = variableEdit({ name: 'MODE', value: 'new', secret: false, forBuild: false, forRuntime: true, was: 'live', scope: 'base' })
    const own = record('MODE', { environmentId: 'e1' })
    const shared = record('MODE', { projectId: 'p1' })
    const update = planSave([edit], context({ projectVariables: [shared], environmentVariables: [own] }))
    expect(update.steps.map((step) => (step.kind === 'variable' ? step.op.type : ''))).toEqual(['update', 'delete'])
    const create = planSave([edit], context())
    expect(create.steps).toHaveLength(1)
    expect(create.steps[0]).toMatchObject({ op: { type: 'create', body: { projectId: 'p1', key: 'MODE', value: 'new' } } })
  })

  it('ignores variables owned by a service binding', () => {
    const bound = record('MODE', { environmentId: 'e1', bindingId: 'b1' })
    const edit = variableEdit({ name: 'MODE', value: 'x', secret: false, forBuild: false, forRuntime: true, was: '', scope: 'environment' })
    expect(planSave([edit], context({ environmentVariables: [bound] })).steps[0]).toMatchObject({ op: { type: 'create' } })
  })
})

describe('remainingEdits', () => {
  it('keeps the edits whose steps have not run', () => {
    const a = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website', scope: 'environment' })
    const b = variableEdit({ name: 'MODE', value: 'x', secret: false, forBuild: false, forRuntime: true, was: '', scope: 'environment' })
    const edits: StagedEdit[] = [a, b]
    const plan = planSave(edits, context())
    expect(plan.steps).toHaveLength(2)
    expect(remainingEdits(edits, plan.steps, 0)).toEqual([a, b])
    expect(remainingEdits(edits, plan.steps, 1)).toEqual([b])
    expect(remainingEdits(edits, plan.steps, 2)).toEqual([])
  })
})

describe('variableFacts', () => {
  it('reads the environment’s own value first, then the project’s', () => {
    const own = record('A', { environmentId: 'e1', value: '2' })
    const shared = record('A', { projectId: 'p1', value: '1', forBuild: true })
    expect(variableFacts('A', [own], [shared])).toEqual({
      value: '2',
      secret: false,
      forBuild: false,
      forRuntime: true,
      hasOwn: true,
      editable: true,
    })
    expect(variableFacts('A', [], [shared])).toMatchObject({ value: '1', forBuild: true, hasOwn: false })
    expect(variableFacts('B', [own], [shared])).toBeNull()
  })

  it('never starts a secret with its value, and keeps binding-owned variables read-only', () => {
    const secret = record('S', { projectId: 'p1', isSecret: true, value: null })
    expect(variableFacts('S', [], [secret])).toMatchObject({ value: '', secret: true })
    const bound = record('B', { environmentId: 'e1', bindingId: 'b1', value: null })
    expect(variableFacts('B', [bound], [])).toMatchObject({ value: '', editable: false })
    const sharedBound = record('C', { projectId: 'p1', bindingId: 'b1' })
    expect(variableFacts('C', [record('C', { environmentId: 'e1' })], [sharedBound])).toMatchObject({ editable: false })
  })
})
