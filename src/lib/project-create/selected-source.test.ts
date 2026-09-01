import { describe, expect, it } from 'vitest'
import type { RepositoryRecord } from '@/lib/instance-api'
import { resolveWizardSelectedSource } from '@/lib/project-create/selected-source'

const listed: RepositoryRecord = {
  id: 'listed-id',
  organizationId: 'org',
  connectionId: null,
  secretId: null,
  provider: 'github',
  repositoryUrl: 'https://github.com/acme/listed.git',
  repositoryExternalId: null,
  defaultBranch: 'main',
  subdirectory: null,
  autoDeploy: 'disabled',
  metadata: null,
  options: null,
  createdAt: '',
  updatedAt: '',
}

const attached: RepositoryRecord = {
  ...listed,
  id: 'attached-id',
  repositoryUrl: 'https://github.com/acme/attached.git',
}

describe('resolveWizardSelectedSource', () => {
  it('prefers the listed row when the selected id is already in cache', () => {
    expect(
      resolveWizardSelectedSource([listed], listed.id, attached),
    ).toEqual(listed)
  })

  it('falls back to the attached row while the list cache catches up', () => {
    expect(
      resolveWizardSelectedSource([], attached.id, attached),
    ).toEqual(attached)
    expect(
      resolveWizardSelectedSource(undefined, attached.id, attached),
    ).toEqual(attached)
  })

  it('returns null when neither the list nor the attach result matches', () => {
    expect(resolveWizardSelectedSource([listed], 'missing', attached)).toBeNull()
    expect(resolveWizardSelectedSource([], '', null)).toBeNull()
  })
})
