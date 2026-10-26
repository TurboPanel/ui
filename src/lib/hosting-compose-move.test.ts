import { describe, expect, it, vi } from 'vitest'
import { normalizeCompose } from '@/lib/compose/types'
import { yamlToComposeDocument } from '@/lib/compose/convert'
import { readComposeHostingEntries } from '@/lib/compose/hosting-service-context'
import { hostingEntryKey } from '@/lib/compose/hosting-extension'
import type { TlsRecord } from '@/lib/instance-api'
import {
  composeRowsAwaitingRemoval,
  configuredHostingState,
  declaredHostingByService,
  findPanelRowForRoute,
  moveComposeHostnameToPanel,
  panelCertificateForMovedRoute,
  panelRowsBesideDeclarations,
  withoutComposeHostingRoute,
} from './hosting-compose-move'

const overlay = yamlToComposeDocument(
  [
    'services:',
    '  web:',
    '    x-turbopanel:',
    '      hosting:',
    '        - hostname: example.test',
    '          www: www-to-root',
    '          tls:',
    '            mode: automatic',
    '        - hostname: shop.example.test',
    '  worker: {}',
  ].join('\n')
)

const library = [
  {
    id: 'cert-1',
    organizationId: 'org',
    name: 'Shop wildcard',
    source: 'upload',
    metadata: { dnsNames: ['*.example.test'] },
    createdAt: '',
    updatedAt: '',
  },
] as unknown as TlsRecord[]

describe('withoutComposeHostingRoute', () => {
  it('drops only the named entry and keeps the rest of the service', () => {
    const next = withoutComposeHostingRoute(
      overlay,
      'web',
      hostingEntryKey({ hostname: 'example.test' })
    )
    expect(next).not.toBeNull()
    expect(readComposeHostingEntries(next!, 'web')).toEqual([{ hostname: 'shop.example.test' }])
  })

  it('removes the settings block once the last entry goes, keeping the service', () => {
    const first = withoutComposeHostingRoute(overlay, 'web', 'example.test /')!
    const last = withoutComposeHostingRoute(first, 'web', 'shop.example.test /')!
    expect(last.data.services).toEqual({ web: {}, worker: {} })
  })

  it('answers null for an entry this file does not hold (the shared file sets it)', () => {
    expect(withoutComposeHostingRoute(overlay, 'web', 'other.test /')).toBeNull()
    expect(withoutComposeHostingRoute(overlay, 'worker', 'example.test /')).toBeNull()
  })
})

describe('panelCertificateForMovedRoute', () => {
  it('keeps Let’s Encrypt as a request after the save', () => {
    expect(panelCertificateForMovedRoute({ tls: { mode: 'automatic' } }, library)).toEqual({
      tlsId: null,
      getLetsEncrypt: true,
      missingRef: null,
    })
  })

  it('keeps a library certificate named by id or by name', () => {
    expect(
      panelCertificateForMovedRoute(
        { tls: { mode: 'certificate', certificateRef: 'Shop wildcard' } },
        library
      )
    ).toEqual({ tlsId: 'cert-1', getLetsEncrypt: false, missingRef: null })
    expect(
      panelCertificateForMovedRoute(
        { tls: { mode: 'certificate', certificateRef: 'cert-1' } },
        library
      )
    ).toEqual({ tlsId: 'cert-1', getLetsEncrypt: false, missingRef: null })
  })

  it('keeps self-signed as no certificate and no request', () => {
    expect(panelCertificateForMovedRoute({ tls: { mode: 'internal' } }, library)).toEqual({
      tlsId: null,
      getLetsEncrypt: false,
      missingRef: null,
    })
    expect(panelCertificateForMovedRoute({}, library)).toEqual({
      tlsId: null,
      getLetsEncrypt: false,
      missingRef: null,
    })
  })

  it('names a certificate the library does not have instead of falling back to self-signed', () => {
    expect(
      panelCertificateForMovedRoute(
        { tls: { mode: 'certificate', certificateRef: 'gone' } },
        library
      )
    ).toEqual({ tlsId: null, getLetsEncrypt: false, missingRef: 'gone' })
  })
})

describe('panelRowsBesideDeclarations', () => {
  const entries = readComposeHostingEntries(overlay, 'web')

  it('lists a moved hostname next to the entries still in the file', () => {
    const moved = { id: 'moved', metadata: {}, options: { hostnames: ['blog.example.test'] } }
    expect(panelRowsBesideDeclarations([moved], entries)).toEqual([moved])
  })

  it('leaves out rows the file owns and rows the next deploy takes over', () => {
    const owned = {
      id: 'owned',
      metadata: { composeOwned: true, composeRoute: 'example.test /' },
      options: { hostnames: ['example.test'] },
    }
    const takenOver = { id: 'adopt', metadata: null, options: { hostnames: ['Shop.Example.test'] } }
    expect(panelRowsBesideDeclarations([owned, takenOver], entries)).toEqual([])
  })

  it('keeps a row on another path of a configured hostname', () => {
    const api = {
      id: 'api',
      metadata: {},
      options: { hostnames: ['example.test'], pathPrefix: '/api' },
    }
    expect(panelRowsBesideDeclarations([api], entries)).toEqual([api])
  })
})

describe('composeRowsAwaitingRemoval', () => {
  const entries = readComposeHostingEntries(overlay, 'web')
  const madeFromFile = (route: string | undefined) => ({
    id: route ?? 'no-route',
    metadata: { composeOwned: true, composeRoute: route },
    options: {},
  })

  it('lists a row the file made whose entry is gone', () => {
    const removed = madeFromFile('blog.example.test /')
    expect(composeRowsAwaitingRemoval([removed], entries)).toEqual([removed])
    expect(composeRowsAwaitingRemoval([removed], [])).toEqual([removed])
  })

  it('treats a row the file made without a route as gone too', () => {
    const unnamed = madeFromFile(undefined)
    expect(composeRowsAwaitingRemoval([unnamed], entries)).toEqual([unnamed])
  })

  it('leaves out rows whose entry is still in the file, and rows this screen made', () => {
    const declared = madeFromFile('example.test /')
    const own = { id: 'own', metadata: {}, options: { hostnames: ['blog.example.test'] } }
    expect(composeRowsAwaitingRemoval([declared, own], entries)).toEqual([])
  })
})

describe('declaredHostingByService', () => {
  it('lists every service that sets hostnames, in file order', () => {
    expect(declaredHostingByService(overlay)).toEqual([
      { composeServiceName: 'web', entries: readComposeHostingEntries(overlay, 'web') },
    ])
    expect(declaredHostingByService(normalizeCompose({}))).toEqual([])
  })
})

describe('moveComposeHostnameToPanel', () => {
  function steps(results: { release?: boolean; saveFile?: boolean; create?: boolean } = {}) {
    const calls: string[] = []
    return {
      calls,
      steps: {
        release: vi.fn(async (id: string) => {
          calls.push(`release ${id}`)
          return results.release ?? true
        }),
        saveFile: vi.fn(async () => {
          calls.push('save file')
          return results.saveFile ?? true
        }),
        createPanelHosting: vi.fn(async () => {
          calls.push('create panel hosting')
          return results.create ?? true
        }),
      },
    }
  }
  const next = withoutComposeHostingRoute(overlay, 'web', 'example.test /')!

  it('releases a deployed hosting before the file loses its entry', async () => {
    const run = steps()
    expect(await moveComposeHostnameToPanel({ hostingId: 'h1', next }, run.steps)).toBe('released')
    expect(run.calls).toEqual(['release h1', 'save file'])
    expect(run.steps.saveFile).toHaveBeenCalledWith(next)
  })

  it('leaves the file alone when the release is refused', async () => {
    const run = steps({ release: false })
    expect(await moveComposeHostnameToPanel({ hostingId: 'h1', next }, run.steps)).toBe('stopped')
    expect(run.calls).toEqual(['release h1'])
  })

  it('reports a failed file save after the release (the next deploy adopts the row again)', async () => {
    const run = steps({ saveFile: false })
    expect(await moveComposeHostnameToPanel({ hostingId: 'h1', next }, run.steps)).toBe('stopped')
    expect(run.calls).toEqual(['release h1', 'save file'])
  })

  it('creates the panel hosting before dropping the entry when nothing was deployed yet', async () => {
    const run = steps()
    expect(await moveComposeHostnameToPanel({ hostingId: null, next }, run.steps)).toBe('created')
    expect(run.calls).toEqual(['create panel hosting', 'save file'])
  })

  it('leaves the file alone when the panel hosting cannot be created', async () => {
    const run = steps({ create: false })
    expect(await moveComposeHostnameToPanel({ hostingId: null, next }, run.steps)).toBe('stopped')
    expect(run.calls).toEqual(['create panel hosting'])
  })

  it('reports a failed drop after the create (the next deploy adopts the panel row)', async () => {
    const run = steps({ saveFile: false })
    expect(await moveComposeHostnameToPanel({ hostingId: null, next }, run.steps)).toBe('stopped')
    expect(run.calls).toEqual(['create panel hosting', 'save file'])
  })
})

describe('findPanelRowForRoute and configuredHostingState', () => {
  const owned = {
    id: 'owned',
    metadata: { composeOwned: true, composeRoute: 'example.test /' },
    options: { hostnames: ['example.test'] },
  }
  const adopted = { ...owned, metadata: { ...owned.metadata, composeAdopted: true } }
  const held = { id: 'held', metadata: {}, options: { hostnames: ['Example.test'] } }

  it('finds the panel row the next deploy would adopt, never a compose-made one', () => {
    expect(findPanelRowForRoute([owned, held], 'example.test /')).toBe(held)
    expect(findPanelRowForRoute([owned], 'example.test /')).toBeUndefined()
    expect(findPanelRowForRoute([held], 'example.test /api')).toBeUndefined()
  })

  it('says where the hosting stands', () => {
    expect(configuredHostingState(owned, undefined)).toBe('deployed')
    expect(configuredHostingState(adopted, undefined)).toBe('adopted')
    expect(configuredHostingState(undefined, held)).toBe('held-by-panel')
    expect(configuredHostingState(undefined, undefined)).toBe('not-deployed')
  })
})
