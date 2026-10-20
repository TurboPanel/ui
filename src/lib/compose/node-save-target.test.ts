import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import { composeForNodeSave, effectiveService } from '@/lib/compose/node-save-target'
import {
  isNodeComposeService,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
} from '@/lib/compose/service-kind'

function doc(services: Record<string, unknown>): ComposeDocument {
  return { version: 1, data: { services }, presentation: { keyOrder: ['services'], comments: {} } }
}

const SID = '11111111-1111-4111-8111-111111111111'
const source = { sourceId: SID, branch: 'main' }
const baseWeb = {
  command: 'npm start',
  'x-turbopanel': { serviceKind: 'node', nodeVersion: '22', packageManager: 'npm', source },
}
const base = doc({ web: baseWeb, db: { image: 'postgres' } })
const patch = (current: Record<string, unknown>) =>
  patchServiceTurbopanelExtension(current, {
    nodeVersion: '24',
    source: { sourceId: SID, branch: 'main' },
  })

function saveFromEnvironment(environmentCompose: ComposeDocument | null) {
  return composeForNodeSave({
    environmentId: 'e1',
    projectCompose: base,
    environmentCompose,
    serviceName: 'web',
    effective: effectiveService(base, environmentCompose, 'web'),
    patch,
  })
}

describe('composeForNodeSave', () => {
  it('writes into the environment, with the markers that let it save, when only the Base defines the service', () => {
    const result = saveFromEnvironment(null)
    expect(result.target).toBe('environment')
    const entry = (result.compose.data.services as Record<string, Record<string, unknown>>).web
    expect(entry.command).toBeUndefined()
    const extension = readServiceTurbopanelExtension(entry)
    expect(extension?.serviceKind).toBe('node')
    expect(extension?.nodeVersion).toBe('24')
    expect(extension?.source).toMatchObject({ sourceId: SID, branch: 'main' })
  })

  it('leaves the Node settings visible and keeps the other values after the save', () => {
    const saved = saveFromEnvironment(doc({ other: { image: 'x' } }))
    const environmentCompose = saved.compose
    expect((environmentCompose.data.services as Record<string, unknown>).other).toEqual({
      image: 'x',
    })
    const shown = effectiveService(base, environmentCompose, 'web') as Record<string, unknown>
    expect(isNodeComposeService(shown)).toBe(true)
    expect(shown.command).toBe('npm start')
    const extension = readServiceTurbopanelExtension(shown)
    expect(extension?.nodeVersion).toBe('24')
    expect(extension?.packageManager).toBe('npm')
    expect(extension?.source?.sourceId).toBe(SID)
    // The Base itself is untouched.
    expect(readServiceTurbopanelExtension(baseWeb)?.nodeVersion).toBe('22')
  })

  it('keeps editing the environment entry when the environment already has one', () => {
    const own = doc({ web: { 'x-turbopanel': { serviceKind: 'node', nodeVersion: '23' } } })
    const result = saveFromEnvironment(own)
    const entry = (result.compose.data.services as Record<string, Record<string, unknown>>).web
    expect(readServiceTurbopanelExtension(entry)?.nodeVersion).toBe('24')
    expect(readServiceTurbopanelExtension(entry)?.serviceKind).toBe('node')
  })

  it('edits the Base only from a view with no environment', () => {
    const result = composeForNodeSave({
      environmentId: null,
      projectCompose: base,
      environmentCompose: null,
      serviceName: 'web',
      effective: baseWeb,
      patch,
    })
    expect(result.target).toBe('project')
    const services = result.compose.data.services as Record<string, Record<string, unknown>>
    expect(services.web.command).toBe('npm start')
    expect(services.db).toEqual({ image: 'postgres' })
    expect(readServiceTurbopanelExtension(services.web)?.nodeVersion).toBe('24')
  })

  it('treats an odd services block, an empty environment id and a missing project as empty', () => {
    const odd: ComposeDocument = {
      version: 1,
      data: { services: [] },
      presentation: { keyOrder: [], comments: {} },
    }
    const result = composeForNodeSave({
      environmentId: '',
      projectCompose: odd,
      environmentCompose: null,
      serviceName: 'web',
      effective: undefined,
      patch: (current) => ({ ...current, marker: true }),
    })
    expect(result.target).toBe('project')
    expect(result.compose.data.services).toEqual({ web: { marker: true } })
    const none = composeForNodeSave({
      environmentId: null,
      projectCompose: null,
      environmentCompose: null,
      serviceName: 'web',
      effective: undefined,
      patch: () => 'plain',
    })
    expect(none.compose.data.services).toEqual({ web: 'plain' })
  })

  it('adds no markers for an effective service that is not a Node app', () => {
    const result = composeForNodeSave({
      environmentId: 'e1',
      projectCompose: base,
      environmentCompose: null,
      serviceName: 'db',
      effective: { image: 'postgres' },
      patch: (current) => ({ ...current, restart: 'always' }),
    })
    expect((result.compose.data.services as Record<string, unknown>).db).toEqual({
      restart: 'always',
    })
  })
})

describe('effectiveService', () => {
  it('reads the Base alone when there is no environment document', () => {
    expect(effectiveService(base, null, 'db')).toEqual({ image: 'postgres' })
    expect(effectiveService(null, null, 'db')).toBeUndefined()
  })
})
