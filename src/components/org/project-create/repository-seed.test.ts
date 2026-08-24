import { describe, expect, it } from 'vitest'
import {
  repositoryServiceName,
  seedRepositoryCompose,
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

function seededService(document: ReturnType<typeof seedRepositoryCompose>) {
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

describe('seedRepositoryCompose', () => {
  it('binds one service to the source id', () => {
    const { name, service } = seededService(seedRepositoryCompose(source(), ''))
    expect(name).toBe('storefront-api')
    expect(readServiceTurbopanelExtension(service)?.source).toEqual({
      sourceId: SOURCE_ID,
    })
  })

  it('pins the branch only when one was typed', () => {
    const { service } = seededService(
      seedRepositoryCompose(source(), '  release/2.0  '),
    )
    expect(readServiceTurbopanelExtension(service)?.source?.branch).toBe(
      'release/2.0',
    )

    const { service: blank } = seededService(
      seedRepositoryCompose(source(), '   '),
    )
    expect(readServiceTurbopanelExtension(blank)?.source?.branch).toBeUndefined()
  })

  /**
   * Native is the default lane for a Git binding, and omitting `buildKind` is
   * how it is spelled — writing it out would pin a build backend the operator
   * never chose.
   */
  it('leaves the build backend at its default', () => {
    const { service } = seededService(seedRepositoryCompose(source(), 'main'))
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
    const document = seedRepositoryCompose(source(), 'main')
    const { service } = seededService(document)
    expect(readServiceTurbopanelExtension(service)?.serviceKind).toBe('node')

    const blocking = lintComposeYaml(composeDocumentToYaml(document)).filter(
      (issue) => issue.level === 'error',
    )
    expect(blocking).toEqual([])
  })

  it('orders services first so the YAML reads top-down', () => {
    expect(seedRepositoryCompose(source(), '').presentation.keyOrder).toEqual([
      'services',
    ])
  })
})
