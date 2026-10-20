import { describe, expect, it } from 'vitest'
import type { ComposeDocument } from '@/lib/compose'
import {
  composeForNodeSave,
  effectiveService,
  nodeValuesThatCannotBeCleared,
  type NodeSaveValues,
} from '@/lib/compose/node-save-target'
import { isNodeComposeService, readServiceTurbopanelExtension } from '@/lib/compose/service-kind'

const SID = '11111111-1111-4111-8111-111111111111'

function doc(services: Record<string, unknown>): ComposeDocument {
  return { version: 1, data: { services }, presentation: { keyOrder: ['services'], comments: {} } }
}

const baseWeb = {
  command: 'npm start',
  'x-turbopanel': {
    serviceKind: 'node',
    nodeVersion: '22',
    packageManager: 'npm',
    appMode: 'development',
    enabled: false,
    documentRoot: 'public',
    startupFile: 'app.js',
    source: { sourceId: SID, branch: 'main', subdirectory: 'web' },
  },
}
const base = doc({ web: baseWeb, db: { image: 'postgres' } })
const baseExt = readServiceTurbopanelExtension(baseWeb)

/** The form as the Base shows it. */
const fromBase: NodeSaveValues = {
  enabled: false,
  nodeVersion: '22',
  packageManager: 'npm',
  appMode: 'development',
  documentRoot: 'public',
  appRoot: 'web',
  startupFile: 'app.js',
}

function saveIn(
  values: Partial<NodeSaveValues>,
  environmentCompose: ComposeDocument | null = null
) {
  const merged = effectiveService(base, environmentCompose, 'web')
  return composeForNodeSave({
    environmentId: 'e1',
    projectCompose: base,
    environmentCompose,
    environmentReady: true,
    serviceName: 'web',
    effective: merged,
    values: { ...fromBase, ...values },
    source: baseExt?.source ?? { sourceId: SID },
  })
}

function shownAfter(
  values: Partial<NodeSaveValues>,
  environmentCompose: ComposeDocument | null = null
) {
  const result = saveIn(values, environmentCompose)
  if (!result.ok) throw new Error(result.reason)
  const shown = effectiveService(base, result.compose, 'web') as Record<string, unknown>
  return { result, shown, ext: shown['x-turbopanel'] as Record<string, unknown> }
}

describe('a save from an environment', () => {
  it('writes nothing for a form that matches the Base', () => {
    const { result } = shownAfter({})
    expect(result.ok && result.target).toBe('environment')
    expect((result.ok && result.compose.data.services) as object).not.toHaveProperty('web')
  })

  it('overrides a Base value and leaves the Node settings visible with the rest kept', () => {
    const { shown, ext, result } = shownAfter({ nodeVersion: '24' })
    expect(isNodeComposeService(shown)).toBe(true)
    expect(shown.command).toBe('npm start')
    expect(ext).toMatchObject({ nodeVersion: '24', packageManager: 'npm', documentRoot: 'public' })
    // Only what differs goes into the environment: the marker and the version.
    const entry = (result.ok ? result.compose.data.services : {}) as Record<
      string,
      Record<string, unknown>
    >
    expect(entry.web['x-turbopanel']).toEqual({ serviceKind: 'node', nodeVersion: '24' })
    expect(readServiceTurbopanelExtension(baseWeb)?.nodeVersion).toBe('22')
  })

  it('sets the mode back to production over a Base mode', () => {
    expect(shownAfter({ appMode: 'production' }).ext.appMode).toBe('production')
  })

  it('turns start-after-deploy back on over a Base that has it off', () => {
    expect(shownAfter({ enabled: true }).ext.enabled).toBe(true)
  })

  it('clears the document root and the startup file over Base values', () => {
    const { ext } = shownAfter({ documentRoot: '', startupFile: '' })
    expect(ext).not.toHaveProperty('documentRoot')
    expect(ext).not.toHaveProperty('startupFile')
    expect(ext.nodeVersion).toBe('22')
  })

  it('writes only the app folder of the source, never a copy of the branch', () => {
    const { result, ext } = shownAfter({ appRoot: 'api' })
    const entry = (result.ok ? result.compose.data.services : {}) as Record<
      string,
      Record<string, unknown>
    >
    expect(entry.web['x-turbopanel']).toEqual({
      serviceKind: 'node',
      source: { subdirectory: 'api', sourceId: SID },
    })
    expect(ext.source).toMatchObject({ branch: 'main', subdirectory: 'api' })
  })

  it('keeps the branch the environment already sets and drops a folder that matches the Base', () => {
    const own = doc({
      web: {
        'x-turbopanel': {
          serviceKind: 'node',
          source: { sourceId: SID, branch: 'staging', subdirectory: 'api' },
        },
      },
    })
    const { ext } = shownAfter({ appRoot: 'web' }, own)
    expect(ext.source).toMatchObject({ branch: 'staging', subdirectory: 'web' })
  })

  it('removes an override that goes back to the Base value', () => {
    const own = doc({ web: { 'x-turbopanel': { serviceKind: 'node', nodeVersion: '24' } } })
    const { ext } = shownAfter({ nodeVersion: '22' }, own)
    expect(ext.nodeVersion).toBe('22')
    const result = saveIn({ nodeVersion: '22' }, own)
    expect(result.ok && Object.keys(result.compose.data.services as object)).toEqual([])
  })

  it('keeps the other keys of the entry the environment already has', () => {
    const own = doc({
      web: { restart: 'always', 'x-turbopanel': { serviceKind: 'node', nodeVersion: '24' } },
    })
    const result = saveIn({ nodeVersion: '22' }, own)
    expect(result.ok && (result.compose.data.services as Record<string, unknown>).web).toEqual({
      restart: 'always',
      'x-turbopanel': { serviceKind: 'node' },
    })
  })

  it('refuses to leave a Base version, package manager or app folder empty, and says why', () => {
    expect(
      nodeValuesThatCannotBeCleared(
        { ...fromBase, nodeVersion: '', packageManager: '', appRoot: '' },
        base,
        'web'
      )
    ).toEqual(['The Node version', 'The package manager', 'The app folder'])
    const result = saveIn({ nodeVersion: '' })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain('comes from the Base')
    expect(nodeValuesThatCannotBeCleared(fromBase, base, 'ghost')).toEqual([])
    expect(nodeValuesThatCannotBeCleared({ ...fromBase, nodeVersion: '' }, null, 'web')).toEqual([])
  })

  it('may leave a version empty when the Base sets none', () => {
    const open = doc({
      web: { 'x-turbopanel': { serviceKind: 'node', source: { sourceId: SID } } },
    })
    const result = composeForNodeSave({
      environmentId: 'e1',
      projectCompose: open,
      environmentCompose: null,
      environmentReady: true,
      serviceName: 'web',
      effective: effectiveService(open, null, 'web'),
      values: {
        ...fromBase,
        enabled: true,
        nodeVersion: '',
        packageManager: '',
        appMode: 'production',
        documentRoot: '',
        startupFile: '',
        appRoot: '',
      },
      source: { sourceId: SID },
    })
    expect(result.ok).toBe(true)
  })

  it('refuses to build on an environment that has not loaded', () => {
    const result = composeForNodeSave({
      environmentId: 'e1',
      projectCompose: base,
      environmentCompose: undefined,
      environmentReady: false,
      serviceName: 'web',
      effective: baseWeb,
      values: fromBase,
      source: { sourceId: SID },
    })
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('not loaded') })
  })

  it('starts from an empty document when a loaded environment has none', () => {
    const { result } = shownAfter({ nodeVersion: '24' }, null)
    expect(result.ok && result.compose.version).toBe(1)
  })
})

describe('a save with no environment', () => {
  it('edits the Base entry whole, keeping its other values', () => {
    const result = composeForNodeSave({
      environmentId: null,
      projectCompose: base,
      environmentCompose: undefined,
      environmentReady: true,
      serviceName: 'web',
      effective: baseWeb,
      values: { ...fromBase, nodeVersion: '24', appRoot: '' },
      source: baseExt?.source ?? { sourceId: SID },
    })
    expect(result.ok && result.target).toBe('project')
    const services = (result.ok ? result.compose.data.services : {}) as Record<
      string,
      Record<string, unknown>
    >
    expect(services.web.command).toBe('npm start')
    expect(services.db).toEqual({ image: 'postgres' })
    const ext = readServiceTurbopanelExtension(services.web)
    expect(ext?.nodeVersion).toBe('24')
    expect(ext?.source?.subdirectory).toBeUndefined()
    expect(ext?.source?.branch).toBe('main')
  })

  it('tolerates a missing project document and an odd services block', () => {
    const odd: ComposeDocument = {
      version: 1,
      data: { services: [] },
      presentation: { keyOrder: [], comments: {} },
    }
    for (const projectCompose of [null, odd]) {
      const result = composeForNodeSave({
        environmentId: '',
        projectCompose,
        environmentCompose: undefined,
        environmentReady: true,
        serviceName: 'web',
        effective: undefined,
        values: { ...fromBase, enabled: true },
        source: { sourceId: SID },
      })
      expect(result.ok && result.target).toBe('project')
    }
  })
})

describe('effectiveService', () => {
  it('reads the Base alone when there is no environment document', () => {
    expect(effectiveService(base, null, 'db')).toEqual({ image: 'postgres' })
    expect(effectiveService(null, null, 'db')).toBeUndefined()
  })
})
