import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import { mergeComposeOverlay } from '@/lib/compose'
import { makeComposeTag } from '@/lib/compose/tags'
import {
  composePathFor,
  principalAccessPath,
  removeEnvironmentValue,
  restoreEnvironmentService,
  setEnvironmentValue,
  type EditResult,
} from './config-compose'

function doc(data: Record<string, unknown>): ComposeDocument {
  return { version: 1, data, presentation: { keyOrder: Object.keys(data), comments: {} } }
}

const web = {
  serviceKind: 'node',
  principal: 'website',
  source: { sourceId: 's1', buildKind: 'image', branch: 'main' },
}

function project(extra: Record<string, unknown> = {}): ComposeDocument {
  return doc({
    services: {
      web: {
        command: 'npm start',
        ports: ['80:80'],
        environment: { A: '1' },
        'x-turbopanel': web,
        ...extra,
      },
      db: { image: 'postgres:17' },
    },
    'x-turbopanel': {
      principals: { website: { access: 'sftp' }, 'staging-web': { access: 'none' } },
    },
  })
}

function data(result: EditResult): Record<string, unknown> {
  if (!result.ok) throw new Error(result.reason)
  return result.document.data
}

const web$ = { serviceName: 'web' }

/** What an environment really runs for one setting: read from the merge of the Base and its changes. */
function readMergedValue(
  projectCompose: unknown,
  environmentCompose: unknown,
  target: { serviceName: string },
  path: readonly string[]
): unknown {
  const merged = mergeComposeOverlay(projectCompose, environmentCompose)
  const services = (merged.data.services ?? {}) as Record<string, unknown>
  let current: unknown = services[target.serviceName]
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

describe('composePathFor', () => {
  it('maps the config-view fields to compose paths', () => {
    expect(composePathFor('linuxUser')).toEqual(['x-turbopanel', 'principal'])
    expect(composePathFor('panel.source.branch')).toEqual(['x-turbopanel', 'source', 'branch'])
    expect(composePathFor('environment.PORT')).toEqual(['environment', 'PORT'])
    expect(composePathFor('deploy.replicas')).toEqual(['deploy', 'replicas'])
    expect(composePathFor('command')).toEqual(['command'])
  })

  it('has no path for a domain, an app kind or a whole app', () => {
    expect(composePathFor('domain:shop.example.com')).toBeNull()
    expect(composePathFor('kind')).toBeNull()
    expect(composePathFor(null)).toBeNull()
  })

  it('names the sign-in access path of a Linux user', () => {
    expect(principalAccessPath('website')).toEqual([
      'x-turbopanel',
      'principals',
      'website',
      'access',
    ])
  })
})

describe('setEnvironmentValue', () => {
  it('writes a Linux user change with the app kind restated, and nothing else', () => {
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: null,
      target: web$,
      path: ['x-turbopanel', 'principal'],
      value: 'staging-web',
    })
    expect(data(result)).toEqual({
      services: {
        web: {
          'x-turbopanel': {
            serviceKind: 'node',
            source: { sourceId: 's1', buildKind: 'image' },
            principal: 'staging-web',
          },
        },
      },
    })
    if (!result.ok) return
    const merged = mergeComposeOverlay(project(), result.document).data as {
      services: { web: Record<string, unknown> }
    }
    expect(merged.services.web.command).toBe('npm start')
    expect(readMergedValue(project(), result.document, web$, ['x-turbopanel', 'principal'])).toBe(
      'staging-web'
    )
  })

  it('restates the repository too for a source setting, in the same shape', () => {
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: null,
      target: web$,
      path: ['x-turbopanel', 'source', 'branch'],
      value: 'staging',
    })
    expect(data(result)).toEqual({
      services: {
        web: {
          'x-turbopanel': {
            serviceKind: 'node',
            source: { sourceId: 's1', buildKind: 'image', branch: 'staging' },
          },
        },
      },
    })
  })

  it('writes the new value when the project still carries the previous one', () => {
    const result = setEnvironmentValue({
      projectCompose: project({
        'x-turbopanel': {
          ...web,
          source: { sourceId: 's1', buildKind: 'railpack', branch: 'main' },
        },
      }),
      environmentCompose: null,
      target: web$,
      path: ['x-turbopanel', 'source', 'branch'],
      value: 'staging',
    })
    expect(data(result)).toEqual({
      services: {
        web: {
          'x-turbopanel': {
            serviceKind: 'node',
            source: { sourceId: 's1', buildKind: 'image', branch: 'staging' },
          },
        },
      },
    })
  })

  it('leaves a plain compose field without markers, and keeps other changes', () => {
    const env = doc({ services: { web: { command: 'old' }, worker: { image: 'x' } } })
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['deploy', 'replicas'],
      value: 3,
    })
    expect(data(result)).toEqual({
      services: { web: { command: 'old', deploy: { replicas: 3 } }, worker: { image: 'x' } },
    })
  })

  it('does not restate a kind the Base does not have', () => {
    const result = setEnvironmentValue({
      projectCompose: doc({ services: { web: { image: 'nginx' } } }),
      environmentCompose: null,
      target: web$,
      path: ['x-turbopanel', 'principal'],
      value: 'u',
    })
    expect(data(result)).toEqual({ services: { web: { 'x-turbopanel': { principal: 'u' } } } })
  })

  it('writes an environment variable into a mapping or a list', () => {
    const mapping = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { environment: { B: '2' } } } }),
      target: web$,
      path: ['environment', 'A'],
      value: '9',
    })
    expect(data(mapping)).toEqual({ services: { web: { environment: { B: '2', A: '9' } } } })
    const list = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { environment: ['B=2', 'A=1'] } } }),
      target: web$,
      path: ['environment', 'A'],
      value: '9',
    })
    expect(data(list)).toEqual({ services: { web: { environment: ['B=2', 'A=9'] } } })
    const added = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { environment: ['B=2'] } } }),
      target: web$,
      path: ['environment', 'C'],
      value: null,
    })
    expect(data(added)).toEqual({ services: { web: { environment: ['B=2', 'C'] } } })
  })

  it('edits inside a stand-alone environment and keeps its override tag', () => {
    const env = doc({
      services: makeComposeTag('override', {
        web: { image: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'a' } },
      }),
    })
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['x-turbopanel', 'principal'],
      value: 'b',
    })
    expect(data(result)).toEqual({
      services: makeComposeTag('override', {
        web: { image: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'b' } },
      }),
    })
  })

  it('refuses an app the environment replaces as a whole', () => {
    const env = doc({ services: { web: makeComposeTag('override', { image: 'x' }) } })
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['command'],
      value: 'x',
    })
    expect(result).toMatchObject({ ok: false })
  })

  it('writes the sign-in access of a Linux user at the root', () => {
    const result = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: null,
      target: { serviceName: null },
      path: principalAccessPath('website'),
      value: 'ssh',
    })
    expect(data(result)).toEqual({
      'x-turbopanel': { principals: { website: { access: 'ssh' } } },
    })
  })
})

describe('removeEnvironmentValue (Go back to Base)', () => {
  it('deletes the entry, so the Base value shows again, and the markers go with it', () => {
    const set = setEnvironmentValue({
      projectCompose: project(),
      environmentCompose: null,
      target: web$,
      path: ['x-turbopanel', 'principal'],
      value: 'staging-web',
    })
    if (!set.ok) throw new Error(set.reason)
    const back = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: set.document,
      target: web$,
      path: ['x-turbopanel', 'principal'],
    })
    expect(data(back)).toEqual({})
    expect(
      readMergedValue(project(), (back as { document: ComposeDocument }).document, web$, [
        'x-turbopanel',
        'principal',
      ])
    ).toBe('website')
  })

  it('keeps other changes of the same app and only strips the markers it added', () => {
    const env = doc({
      services: {
        web: {
          command: 'x',
          'x-turbopanel': {
            serviceKind: 'node',
            principal: 'a',
            source: { sourceId: 's1', buildKind: 'image' },
          },
        },
      },
    })
    const result = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['x-turbopanel', 'principal'],
    })
    expect(data(result)).toEqual({ services: { web: { command: 'x' } } })
  })

  it('keeps a source block that still holds a branch, and a different kind', () => {
    const env = doc({
      services: {
        web: {
          'x-turbopanel': {
            serviceKind: 'site',
            principal: 'a',
            source: { sourceId: 's1', branch: 'x' },
          },
        },
      },
    })
    const result = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['x-turbopanel', 'principal'],
    })
    expect(data(result)).toEqual({
      services: {
        web: { 'x-turbopanel': { serviceKind: 'site', source: { sourceId: 's1', branch: 'x' } } },
      },
    })
  })

  it('deleting is not the same as !reset: a reset removes the Base value', () => {
    const reset = doc({ services: { web: { command: makeComposeTag('reset', null) } } })
    const merged = mergeComposeOverlay(project(), reset).data as {
      services: { web: Record<string, unknown> }
    }
    expect('command' in merged.services.web).toBe(false)
    const back = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: reset,
      target: web$,
      path: ['command'],
    })
    expect(
      readMergedValue(project(), (back as { document: ComposeDocument }).document, web$, [
        'command',
      ])
    ).toBe('npm start')
  })

  it('removes an environment variable from a mapping, a list, and the last one', () => {
    const mapping = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({
        services: { web: { command: 'x', environment: { A: '9', B: '2' } } },
      }),
      target: web$,
      path: ['environment', 'A'],
    })
    expect(data(mapping)).toEqual({ services: { web: { command: 'x', environment: { B: '2' } } } })
    const list = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { command: 'x', environment: ['A=9', 'B=2'] } } }),
      target: web$,
      path: ['environment', 'A'],
    })
    expect(data(list)).toEqual({ services: { web: { command: 'x', environment: ['B=2'] } } })
    const last = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { command: 'x', environment: ['A=9'] } } }),
      target: web$,
      path: ['environment', 'A'],
    })
    expect(data(last)).toEqual({ services: { web: { command: 'x' } } })
    const lastMapping = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: doc({ services: { web: { command: 'x', environment: { A: '9' } } } }),
      target: web$,
      path: ['environment', 'A'],
    })
    expect(data(lastMapping)).toEqual({ services: { web: { command: 'x' } } })
  })

  it('does nothing for an app or a path the environment does not have', () => {
    const env = doc({ services: { web: { command: 'x' } } })
    expect(
      removeEnvironmentValue({
        projectCompose: project(),
        environmentCompose: env,
        target: { serviceName: 'ghost' },
        path: ['command'],
      })
    ).toEqual({ ok: true, document: env })
    expect(
      data(
        removeEnvironmentValue({
          projectCompose: project(),
          environmentCompose: env,
          target: web$,
          path: ['deploy', 'replicas'],
        })
      )
    ).toEqual({ services: { web: { command: 'x' } } })
    expect(
      data(
        removeEnvironmentValue({
          projectCompose: project(),
          environmentCompose: doc({
            services: {
              web: { deploy: makeComposeTag('override', { replicas: 2 }), command: 'x' },
            },
          }),
          target: web$,
          path: ['deploy', 'replicas'],
        })
      )
    ).toMatchObject({ services: { web: { command: 'x' } } })
  })

  it('keeps the markers of a stand-alone environment', () => {
    const env = doc({
      services: makeComposeTag('override', {
        web: { image: 'x', 'x-turbopanel': { serviceKind: 'node', principal: 'a' } },
      }),
    })
    const result = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: web$,
      path: ['x-turbopanel', 'principal'],
    })
    expect(data(result)).toEqual({
      services: makeComposeTag('override', {
        web: { image: 'x', 'x-turbopanel': { serviceKind: 'node' } },
      }),
    })
  })

  it('removes a root entry and its empty parents', () => {
    const env = doc({ 'x-turbopanel': { principals: { website: { access: 'ssh' } } } })
    const result = removeEnvironmentValue({
      projectCompose: project(),
      environmentCompose: env,
      target: { serviceName: null },
      path: principalAccessPath('website'),
    })
    expect(data(result)).toEqual({})
  })

  it('refuses an app replaced as a whole', () => {
    const env = doc({ services: { web: makeComposeTag('override', { image: 'x' }) } })
    expect(
      removeEnvironmentValue({
        projectCompose: project(),
        environmentCompose: env,
        target: web$,
        path: ['command'],
      })
    ).toMatchObject({ ok: false })
  })
})

describe('restoreEnvironmentService', () => {
  it('brings back an app the environment removed', () => {
    const env = doc({ services: { db: makeComposeTag('reset', null), worker: { image: 'x' } } })
    expect(data(restoreEnvironmentService(env, 'db'))).toEqual({
      services: { worker: { image: 'x' } },
    })
  })

  it('refuses an app that is not removed, and an empty result is a blank document', () => {
    expect(
      restoreEnvironmentService(doc({ services: { db: { image: 'x' } } }), 'db')
    ).toMatchObject({ ok: false })
    expect(restoreEnvironmentService(null, 'db')).toMatchObject({ ok: false })
    const only = doc({ services: { db: makeComposeTag('reset', null) } })
    expect(data(restoreEnvironmentService(only, 'db'))).toEqual({})
  })
})
