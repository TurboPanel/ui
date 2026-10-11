import { describe, expect, it, vi } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import { linuxUserEdit, variableEdit, type SaveContext, type StagedEdit } from './config-edits'
import { saveEdits, type SaveDeps } from './config-save'

function doc(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: Object.keys(data), comments: {} } }
}

const context: SaveContext = {
  projectId: 'p1',
  environmentId: 'e1',
  projectCompose: doc({
    services: { web: { command: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'website' } } },
  }),
  environmentCompose: null,
  projectVariables: [],
  environmentVariables: [],
}

function deps(overrides: Partial<SaveDeps> = {}): SaveDeps {
  return {
    load: vi.fn(() => Promise.resolve(context)),
    saveProjectCompose: vi.fn(() => Promise.resolve()),
    saveEnvironmentCompose: vi.fn(() => Promise.resolve()),
    runVariable: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

const user = linuxUserEdit({ serviceName: 'web', user: 'staging-web', was: 'website', scope: 'environment' })
const variable = variableEdit({ name: 'MODE', value: 'x', secret: false, forBuild: false, forRuntime: true, was: '', scope: 'environment' })

describe('saveEdits', () => {
  it('runs every step in order and leaves nothing staged', async () => {
    const calls: string[] = []
    const d = deps({
      saveEnvironmentCompose: vi.fn(() => {
        calls.push('environment')
        return Promise.resolve()
      }),
      runVariable: vi.fn(() => {
        calls.push('variable')
        return Promise.resolve()
      }),
    })
    const outcome = await saveEdits([user, variable], d)
    expect(outcome).toEqual({ remaining: [], problems: [], error: null, saved: 2 })
    expect(calls).toEqual(['environment', 'variable'])
    expect(d.saveEnvironmentCompose).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'staging-web' } } } },
      })
    )
  })

  it('saves the Base before this environment', async () => {
    const calls: string[] = []
    const d = deps({
      saveProjectCompose: vi.fn(() => {
        calls.push('project')
        return Promise.resolve()
      }),
      saveEnvironmentCompose: vi.fn(() => {
        calls.push('environment')
        return Promise.resolve()
      }),
      load: vi.fn(() =>
        Promise.resolve({
          ...context,
          environmentCompose: doc({
            services: { web: { 'x-turbopanel': { serviceKind: 'node', principal: 'staging-web' } } },
          }),
        })
      ),
    })
    const base = linuxUserEdit({ serviceName: 'web', user: 'shared', was: 'staging-web', scope: 'base' })
    await saveEdits([base], d)
    expect(calls).toEqual(['project', 'environment'])
  })

  it('keeps the edits of steps that did not run when one fails', async () => {
    const d = deps({ runVariable: vi.fn(() => Promise.reject(new Error('HTTP 400: nope'))) })
    const outcome = await saveEdits([user, variable], d)
    expect(outcome).toMatchObject({ saved: 1, error: 'HTTP 400: nope' })
    expect(outcome.remaining).toEqual([variable])
  })

  it('uses a plain sentence for a failure that is not an Error', async () => {
    const d = deps({ saveEnvironmentCompose: vi.fn(() => Promise.reject('x')) })
    const outcome = await saveEdits([user], d)
    expect(outcome).toMatchObject({ saved: 0, error: 'Could not save these changes.' })
    expect(outcome.remaining).toEqual([user])
  })

  it('keeps everything staged when the fresh data cannot be loaded', async () => {
    const d = deps({ load: vi.fn(() => Promise.reject(new Error('offline'))) })
    const outcome = await saveEdits([user], d)
    expect(outcome).toEqual({ remaining: [user], problems: [], error: 'offline', saved: 0 })
    expect(d.saveEnvironmentCompose).not.toHaveBeenCalled()
  })

  it('stops, saving nothing, when an edit no longer fits', async () => {
    const stale: StagedEdit = linuxUserEdit({ serviceName: 'ghost', user: 'x', was: '', scope: 'base' })
    const d = deps()
    const outcome = await saveEdits([user, stale], d)
    expect(outcome.saved).toBe(0)
    expect(outcome.problems).toEqual([{ key: 'svc:ghost:linuxUser', reason: 'The Base has no app named ghost.' }])
    expect(outcome.error).toBe('Some changes no longer fit what is saved. Undo them and try again.')
    expect(outcome.remaining).toEqual([user, stale])
    expect(d.saveEnvironmentCompose).not.toHaveBeenCalled()
  })

  it('saves nothing for edits that change nothing', async () => {
    const same = linuxUserEdit({ serviceName: 'web', user: 'website', was: 'website', scope: 'base' })
    const d = deps()
    expect(await saveEdits([same], d)).toEqual({ remaining: [], problems: [], error: null, saved: 0 })
  })
})
