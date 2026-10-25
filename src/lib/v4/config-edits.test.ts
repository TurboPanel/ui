import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import { makeComposeTag } from '@/lib/compose/tags'
import type { VariableRecord } from '@/lib/instance-api'
import { principalAccessPath } from './config-compose'
import {
  changeActions,
  goBackEdit,
  linuxUserEdit,
  planSave,
  remainingEdits,
  removeVariableEdit,
  stageEdit,
  stagedEditFor,
  stagedNote,
  unsavedSummary,
  unstageEdit,
  variableFacts,
  variableEdit,
  variableUseOf,
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
const byKey = (key: string): ChangeRowModel =>
  changes.find((item) => item.key === key) as ChangeRowModel

describe('staging', () => {
  it('keeps one edit per row, the latest', () => {
    const first = linuxUserEdit({ serviceName: 'web', user: 'a', was: 'website' })
    const second = linuxUserEdit({ serviceName: 'web', user: 'b', was: 'website' })
    const other = variableEdit({
      name: 'X',
      value: '1',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: 'Not set',
    })
    const staged = stageEdit(stageEdit(stageEdit([], first), other), second)
    expect(staged.map((edit) => edit.key)).toEqual(['var:X', 'svc:web:linuxUser'])
    expect(stagedEditFor(staged, 'svc:web:linuxUser')).toBe(second)
    expect(stagedEditFor(staged, 'nope')).toBeUndefined()
    expect(unstageEdit(staged, 'var:X')).toEqual([second])
  })

  it('says what an unsaved edit will do', () => {
    const change = byKey('svc:web:command')
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    expect(stagedNote(goBackEdit(change, target))).toBe(
      'Not saved yet: goes back to the Base value'
    )
    expect(stagedNote(linuxUserEdit({ serviceName: 'web', user: 'a', was: '' }))).toBe(
      'Not saved yet: a'
    )
  })

  it('counts unsaved changes', () => {
    expect(unsavedSummary(1)).toBe('1 unsaved change')
    expect(unsavedSummary(3)).toBe('3 unsaved changes')
  })

  it('shows a secret as Hidden in the pending list', () => {
    expect(
      variableEdit({
        name: 'K',
        value: 'x',
        secret: true,
        forBuild: false,
        forRuntime: true,
        was: 'Hidden',
      }).now
    ).toBe('Hidden')
    expect(linuxUserEdit({ serviceName: 'web', user: 'a', was: '' }).was).toBe('Not set')
  })
})

describe('changeActions', () => {
  it('offers only Go back for a field change: the Base is edited from the Base tab', () => {
    const actions = changeActions(byKey('svc:web:command'), [], false)
    expect(actions.goBack).toEqual({ type: 'field', serviceName: 'web', path: ['command'] })
  })

  it('offers only Go back for a removed value and none for a secret to move', () => {
    const removed = { ...byKey('svc:web:command'), kind: 'removed' as const }
    expect(changeActions(removed, [], false)).toMatchObject({
      goBack: { type: 'field' },
    })
    const masked = { ...byKey('svc:web:command'), masked: true }
    expect(changeActions(masked, [], false)).toMatchObject({
      goBack: { type: 'field' },
    })
  })

  it('maps a Linux user sign-in change to the root and a user change to the app', () => {
    const access = {
      ...byKey('svc:web:command'),
      key: 'user:website',
      area: 'linuxUser' as const,
      field: 'access',
      serviceName: null,
    }
    expect(changeActions(access, [], false).goBack).toEqual({
      type: 'field',
      serviceName: null,
      path: principalAccessPath('website'),
    })
    expect(changeActions(byKey('svc:web:linuxUser'), [], false).goBack).toEqual({
      type: 'field',
      serviceName: 'web',
      path: ['x-turbopanel', 'principal'],
    })
  })

  it('has nothing for domains, whole apps and settings without a path', () => {
    const domain = { ...byKey('svc:web:command'), area: 'domain' as const, field: 'domain:x' }
    expect(changeActions(domain, [], false)).toEqual({ goBack: null })
    expect(changeActions(byKey('svc:worker'), [], false)).toEqual({ goBack: null })
    const kind = { ...byKey('svc:web:command'), field: 'kind' }
    expect(changeActions(kind, [], false)).toEqual({ goBack: null })
    const noApp = { ...byKey('svc:web:command'), serviceName: null }
    expect(changeActions(noApp, [], false)).toEqual({ goBack: null })
  })

  it('offers Go back for an app the environment removed', () => {
    const removed = { ...byKey('svc:worker'), kind: 'removed' as const }
    expect(changeActions(removed, [], false)).toEqual({
      goBack: { type: 'service', serviceName: 'worker' },
    })
    expect(changeActions({ ...removed, serviceName: null }, [], false)).toEqual({
      goBack: null,
    })
  })

  it('offers variable actions only for the environment’s own, editable, non-secret values', () => {
    const change = byKey('var:API_URL')
    const own = record('API_URL', { environmentId: 'e1', value: 'x' })
    expect(changeActions(change, [own], false)).toEqual({
      goBack: { type: 'variable', name: 'API_URL' },
    })
    expect(changeActions(change, [], false)).toEqual({ goBack: null })
    expect(changeActions(change, [{ ...own, bindingId: 'b1' }], false)).toEqual({
      goBack: null,
    })
    expect(changeActions(change, [{ ...own, isSecret: true, value: null }], false)).toMatchObject(
      {}
    )
    expect(changeActions({ ...change, masked: true }, [own], false)).toMatchObject({})
  })

  it('leaves a stand-alone environment only its variables', () => {
    expect(changeActions(byKey('svc:web:command'), [], true)).toEqual({
      goBack: null,
    })
    const own = record('API_URL', { environmentId: 'e1', value: 'x' })
    expect(changeActions(byKey('var:API_URL'), [own], true).goBack).toEqual({
      type: 'variable',
      name: 'API_URL',
    })
  })

  it('builds the staged edit for a Go back press', () => {
    const change = byKey('svc:web:command')
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    expect(goBackEdit(change, target)).toMatchObject({
      kind: 'go-back',
      key: 'svc:web:command',
      area: 'web',
      was: 'npm run staging',
      now: 'npm start (Base)',
    })
    expect(goBackEdit(byKey('var:API_URL'), { type: 'variable', name: 'API_URL' }).area).toBe(
      'Variables'
    )
    expect(goBackEdit(byKey('svc:web:linuxUser'), target).area).toBe('Hosting Accounts')
    expect(goBackEdit({ ...change, serviceName: null }, target).area).toBe('Apps')
  })
})

describe('planSave', () => {
  it('saves a Linux user for this environment only, as one environment step', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website' })
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

  it('replaces this environment’s own Hosting Account and never touches the Base', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'shared', was: 'staging-web' })
    const env = doc({
      services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'staging-web' } } },
    })
    const plan = planSave([edit], context({ environmentCompose: env }))
    expect(plan.steps.map((step) => step.kind)).toEqual(['environment-compose'])
  })

  it('writes the environment’s own value even when it matches the Base, and sends nothing when the document is unchanged', () => {
    const edit = linuxUserEdit({ serviceName: 'web', user: 'website', was: 'website' })
    expect(planSave([edit], context()).steps.map((step) => step.kind)).toEqual([
      'environment-compose',
    ])
    const env = doc({
      services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'website' } } },
    })
    expect(planSave([edit], context({ environmentCompose: env })).steps).toEqual([])
  })

  it('goes back for compose values', () => {
    const env = doc({ services: { web: { command: 'npm run staging' } } })
    const target = { type: 'field' as const, serviceName: 'web', path: ['command'] }
    const back = planSave(
      [goBackEdit(byKey('svc:web:command'), target)],
      context({ environmentCompose: env })
    )
    expect(back.steps).toHaveLength(1)
    expect(back.steps[0]).toMatchObject({ kind: 'environment-compose', document: { data: {} } })
  })

  it('restores a removed app', () => {
    const env = doc({ services: { worker: makeComposeTag('reset', null) } })
    const service = { type: 'service' as const, serviceName: 'worker' }
    const restore = planSave(
      [goBackEdit(byKey('svc:worker'), service)],
      context({ environmentCompose: env })
    )
    expect(restore.steps).toHaveLength(1)
  })

  it('reports an edit that no longer fits and plans nothing', () => {
    const target = { type: 'variable' as const, name: 'API_URL' }
    const plan = planSave(
      [
        goBackEdit(byKey('var:API_URL'), target),
        goBackEdit(byKey('svc:web:linuxUser'), { type: 'service', serviceName: 'web' }),
      ],
      context()
    )
    expect(plan.steps).toEqual([])
    expect(plan.problems.map((item) => item.key)).toEqual(['var:API_URL', 'svc:web:linuxUser'])
  })

  it('deletes the environment’s own variable when going back', () => {
    const own = record('API_URL', { environmentId: 'e1', value: 'staging', forBuild: true })
    const shared = record('API_URL', { projectId: 'p1', value: 'live' })
    const target = { type: 'variable' as const, name: 'API_URL' }
    const back = planSave(
      [goBackEdit(byKey('var:API_URL'), target)],
      context({ environmentVariables: [own] })
    )
    expect(back.steps).toEqual([
      { kind: 'variable', op: { type: 'delete', id: own.id }, editKeys: ['var:API_URL'] },
    ])
  })

  it('refuses a variable that is gone', () => {
    const target = { type: 'variable' as const, name: 'API_URL' }
    expect(planSave([goBackEdit(byKey('var:API_URL'), target)], context()).problems).toHaveLength(1)
  })

  it('sets a variable for this environment: updates its own, or creates one that stays secret like the project’s', () => {
    const edit = variableEdit({
      name: 'MODE',
      value: 'staging',
      secret: false,
      forBuild: true,
      forRuntime: false,
      was: 'live',
    })
    const own = record('MODE', { environmentId: 'e1' })
    expect(planSave([edit], context({ environmentVariables: [own] })).steps[0]).toMatchObject({
      op: { type: 'update', id: own.id, body: { value: 'staging' } },
    })
    const moved = variableEdit({
      name: 'MODE',
      value: 'staging',
      secret: false,
      forBuild: true,
      forRuntime: false,
      was: 'live',
      useChanged: true,
    })
    expect(planSave([moved], context({ environmentVariables: [own] })).steps[0]).toMatchObject({
      op: { body: { value: 'staging', forBuild: true, forRuntime: false } },
    })
    const shared = record('MODE', {
      projectId: 'p1',
      isSecret: true,
      forBuild: false,
      forRuntime: true,
    })
    expect(planSave([edit], context({ projectVariables: [shared] })).steps[0]).toMatchObject({
      op: {
        type: 'create',
        body: {
          environmentId: 'e1',
          key: 'MODE',
          value: 'staging',
          isSecret: true,
          forBuild: true,
          forRuntime: false,
        },
      },
    })
    expect(planSave([edit], context()).steps[0]).toMatchObject({
      op: { type: 'create', body: { isSecret: false, forBuild: true, forRuntime: false } },
    })
  })

  it('changes only where a variable is used, keeping its saved value', () => {
    const edit = variableEdit({
      name: 'MODE',
      value: null,
      secret: true,
      forBuild: true,
      forRuntime: true,
      was: 'Hidden',
    })
    expect(edit.now).toBe('Build and run')
    const own = record('MODE', { environmentId: 'e1', isSecret: true })
    const step = planSave([edit], context({ environmentVariables: [own] })).steps[0]
    expect(step).toMatchObject({
      op: { type: 'update', id: own.id, body: { forBuild: true, forRuntime: true } },
    })
    expect(step.kind === 'variable' && step.op.type === 'update' && 'value' in step.op.body).toBe(
      false
    )
    const plan = planSave(
      [edit],
      context({ projectVariables: [record('MODE', { projectId: 'p1' })] })
    )
    expect(plan.steps).toEqual([])
    expect(plan.problems).toEqual([
      { key: 'var:MODE', reason: 'Enter a value for MODE to set it for this environment.' },
    ])
  })

  it('says the new place next to a new value', () => {
    const base = { name: 'A', secret: false, forBuild: true, forRuntime: false, was: '1' }
    expect(variableEdit({ ...base, value: '2', useChanged: true }).now).toBe('2 · Build only')
    expect(variableEdit({ ...base, value: '2' }).now).toBe('2')
    expect(variableUseOf({ forBuild: false, forRuntime: false })).toBe('run')
    expect(variableUseOf({ forBuild: true, forRuntime: true })).toBe('both')
  })

  it('removes this environment’s own variable, or says it is gone', () => {
    const edit = removeVariableEdit({ name: 'MODE', was: 'x', inBase: false })
    expect(edit).toMatchObject({ key: 'var:MODE', now: 'Removed' })
    expect(stagedNote(edit)).toBe('Not saved yet: removed')
    expect(removeVariableEdit({ name: 'MODE', was: 'x', inBase: true }).now).toBe('Base value')
    const own = record('MODE', { environmentId: 'e1' })
    expect(planSave([edit], context({ environmentVariables: [own] })).steps).toEqual([
      { kind: 'variable', op: { type: 'delete', id: own.id }, editKeys: ['var:MODE'] },
    ])
    expect(planSave([edit], context()).problems).toEqual([
      { key: 'var:MODE', reason: 'MODE is no longer set in this environment.' },
    ])
  })

  it('sets a variable for this environment only and leaves the Base value alone', () => {
    const edit = variableEdit({
      name: 'MODE',
      value: 'new',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: 'live',
    })
    const own = record('MODE', { environmentId: 'e1' })
    const shared = record('MODE', { projectId: 'p1' })
    const update = planSave(
      [edit],
      context({ projectVariables: [shared], environmentVariables: [own] })
    )
    expect(update.steps.map((step) => (step.kind === 'variable' ? step.op.type : ''))).toEqual([
      'update',
    ])
    expect(update.steps[0]).toMatchObject({ op: { id: own.id, body: { value: 'new' } } })
    const create = planSave([edit], context())
    expect(create.steps).toHaveLength(1)
    expect(create.steps[0]).toMatchObject({
      op: { type: 'create', body: { environmentId: 'e1', key: 'MODE', value: 'new' } },
    })
  })

  it('ignores variables owned by a service binding', () => {
    const bound = record('MODE', { environmentId: 'e1', bindingId: 'b1' })
    const edit = variableEdit({
      name: 'MODE',
      value: 'x',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: '',
    })
    expect(planSave([edit], context({ environmentVariables: [bound] })).steps[0]).toMatchObject({
      op: { type: 'create' },
    })
  })
})

describe('planSave on the Base', () => {
  const base = (extra: Partial<SaveContext> = {}) =>
    context({ base: true, environmentCompose: doc({ services: { web: {} } }), ...extra })

  it('creates a project variable, never an environment one', () => {
    const edit = variableEdit({
      name: 'API_URL',
      value: 'https://api',
      secret: false,
      forBuild: true,
      forRuntime: true,
      was: 'Not set',
    })
    const own = record('API_URL', { environmentId: 'e1' })
    expect(planSave([edit], base({ environmentVariables: [own] })).steps).toEqual([
      {
        kind: 'variable',
        op: {
          type: 'create',
          body: {
            projectId: 'p1',
            key: 'API_URL',
            value: 'https://api',
            isSecret: false,
            forBuild: true,
            forRuntime: true,
          },
        },
        editKeys: ['var:API_URL'],
      },
    ])
  })

  it('updates and removes the project’s own variable', () => {
    const shared = record('MODE', { projectId: 'p1' })
    const update = variableEdit({
      name: 'MODE',
      value: null,
      secret: false,
      forBuild: true,
      forRuntime: false,
      was: 'v',
    })
    expect(planSave([update], base({ projectVariables: [shared] })).steps[0]).toMatchObject({
      op: { type: 'update', id: shared.id, body: { forBuild: true, forRuntime: false } },
    })
    const remove = removeVariableEdit({ name: 'MODE', was: 'v', inBase: false })
    expect(planSave([remove], base({ projectVariables: [shared] })).steps).toEqual([
      { kind: 'variable', op: { type: 'delete', id: shared.id }, editKeys: ['var:MODE'] },
    ])
  })

  it('says the Base when the variable is gone', () => {
    const remove = removeVariableEdit({ name: 'MODE', was: 'v', inBase: false })
    expect(planSave([remove], base()).problems).toEqual([
      { key: 'var:MODE', reason: 'MODE is no longer set on the Base.' },
    ])
  })
})

describe('remainingEdits', () => {
  it('keeps the edits whose steps have not run', () => {
    const a = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website' })
    const b = variableEdit({
      name: 'MODE',
      value: 'x',
      secret: false,
      forBuild: false,
      forRuntime: true,
      was: '',
    })
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
      inBase: true,
      editable: true,
    })
    expect(variableFacts('A', [], [shared])).toMatchObject({
      value: '1',
      forBuild: true,
      hasOwn: false,
      inBase: true,
    })
    expect(variableFacts('A', [own], [])).toMatchObject({ hasOwn: true, inBase: false })
    expect(variableFacts('B', [own], [shared])).toBeNull()
  })

  it('never starts a secret with its value, and keeps binding-owned variables read-only', () => {
    const secret = record('S', { projectId: 'p1', isSecret: true, value: null })
    expect(variableFacts('S', [], [secret])).toMatchObject({ value: '', secret: true })
    const bound = record('B', { environmentId: 'e1', bindingId: 'b1', value: null })
    expect(variableFacts('B', [bound], [])).toMatchObject({ value: '', editable: false })
    const sharedBound = record('C', { projectId: 'p1', bindingId: 'b1' })
    expect(variableFacts('C', [record('C', { environmentId: 'e1' })], [sharedBound])).toMatchObject(
      { editable: false }
    )
  })
})
