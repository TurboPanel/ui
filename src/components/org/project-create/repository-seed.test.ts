import { describe, expect, it } from 'vitest'
import {
  repositoryServiceName,
  seedComposeForLane,
} from '@/components/org/project-create/repository-seed'
import { lintComposeYaml, composeDocumentToYaml } from '@/lib/compose'
import { readServiceTurbopanelExtension } from '@/lib/compose/service-kind'
import type { SourceRecord } from '@/lib/instance-api'

const SOURCE_ID = '11111111-2222-4333-8444-555555555555'

function source(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: SOURCE_ID,
    organizationId: 'org',
    installationId: null,
    serviceId: null,
    environmentId: null,
    credentialId: null,
    provider: 'github',
    repositoryUrl: 'https://github.com/turbopanel/Storefront-API.git',
    repositoryExternalId: null,
    defaultBranch: 'main',
    subdirectory: null,
    autoDeploy: 'disabled',
    metadata: null,
    options: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function seededService(document: ReturnType<typeof seedComposeForLane>) {
  const services = document.data.services as Record<
    string,
    Record<string, unknown>
  >
  const name = Object.keys(services)[0] ?? ''
  return { name, service: services[name] ?? {} }
}

describe('repositoryServiceName', () => {
  it('slugs the repository name out of a clone URL', () => {
    expect(repositoryServiceName(source())).toBe('storefront-api')
  })

  it('reads an SSH remote the same way', () => {
    expect(
      repositoryServiceName(
        source({ repositoryUrl: 'git@gitlab.com:acme/Web_App.git' }),
      ),
    ).toBe('web-app')
  })

  it('never emits a leading or trailing dash', () => {
    expect(
      repositoryServiceName(
        source({ repositoryUrl: 'https://example.com/acme/--api--' }),
      ),
    ).toBe('api')
  })

  it('falls back when the name slugs away to nothing', () => {
    expect(
      repositoryServiceName(source({ repositoryUrl: 'https://example.com/a/…' })),
    ).toBe('app')
  })
})

describe('seedComposeForLane', () => {
  it('binds one service to the source id', () => {
    const { name, service } = seededService(seedComposeForLane({ source: source(), branch: '', lane: 'app' }))
    expect(name).toBe('storefront-api')
    expect(readServiceTurbopanelExtension(service)?.source).toEqual({
      sourceId: SOURCE_ID,
    })
  })

  it('pins the branch only when one was typed', () => {
    const { service } = seededService(
      seedComposeForLane({ source: source(), branch: '  release/2.0  ', lane: 'app' }),
    )
    expect(readServiceTurbopanelExtension(service)?.source?.branch).toBe(
      'release/2.0',
    )

    const { service: blank } = seededService(
      seedComposeForLane({ source: source(), branch: '   ', lane: 'app' }),
    )
    expect(readServiceTurbopanelExtension(blank)?.source?.branch).toBeUndefined()
  })

  /**
   * Native is the default lane for a Git binding, and omitting `buildKind` is
   * how it is spelled — writing it out would pin a build backend the operator
   * never chose.
   */
  it('leaves the build backend at its default', () => {
    const { service } = seededService(seedComposeForLane({ source: source(), branch: 'main', lane: 'app' }))
    expect(
      readServiceTurbopanelExtension(service)?.source?.buildKind,
    ).toBeUndefined()
  })

  /**
   * A bound service declares neither `image` nor `build`, so it only survives
   * create because `node` is host-native. Without this the control plane
   * answers `compose_invalid` and the wizard's single Create fails.
   */
  it('produces a document the compose linter accepts', () => {
    const document = seedComposeForLane({ source: source(), branch: 'main', lane: 'app' })
    const { service } = seededService(document)
    expect(readServiceTurbopanelExtension(service)?.serviceKind).toBe('node')

    const blocking = lintComposeYaml(composeDocumentToYaml(document)).filter(
      (issue) => issue.level === 'error',
    )
    expect(blocking).toEqual([])
  })

  it('orders services first so the YAML reads top-down', () => {
    expect(seedComposeForLane({ source: source(), branch: '', lane: 'app' }).presentation.keyOrder).toEqual([
      'services',
    ])
  })
})

describe('seedComposeForLane produces a valid document for every lane', () => {
  // The trap this guards: a compose service needs `image` or `build` unless it
  // is host-native or Railpack-built. Every synthesized lane must be
  // host-native, or Create fails with `compose_invalid`.
  const lanes = ['app', 'static', 'site-php'] as const

  for (const lane of lanes) {
    it(`seeds a host-native service for the ${lane} lane`, () => {
      const document = seedComposeForLane({
        source: source(),
        branch: 'main',
        lane,
      })
      const { service } = seededService(document)
      const extension = service['x-turbopanel'] as Record<string, unknown>
      expect(['site', 'node']).toContain(extension.serviceKind)
      // No image and no build — that is the point of a host-native lane.
      expect(service.image).toBeUndefined()
      expect(service.build).toBeUndefined()
      expect((extension.source as Record<string, unknown>).sourceId).toBe(source().id)
    })
  }

  it('uses the repository document itself for the compose lane', () => {
    // No synthesized service, and deliberately no x-turbopanel: what the
    // operator authored upstream should not silently acquire our metadata.
    const repositoryCompose = {
      version: 1 as const,
      data: { services: { api: { image: 'nginx' } } },
      presentation: { keyOrder: ['services'], comments: {} },
    }
    const document = seedComposeForLane({
      source: source(),
      branch: 'main',
      lane: 'compose',
      repositoryCompose,
    })
    expect(document).toBe(repositoryCompose)
  })

  it('turns PHP on for the site-php lane and leaves it off for static', () => {
    const php = seededService(
      seedComposeForLane({ source: source(), branch: '', lane: 'site-php' }),
    ).service['x-turbopanel'] as Record<string, unknown>
    expect(php.php).toBeDefined()

    const staticSite = seededService(
      seedComposeForLane({ source: source(), branch: '', lane: 'static' }),
    ).service['x-turbopanel'] as Record<string, unknown>
    expect(staticSite.php).toBeUndefined()
  })
})
