import { describe, expect, it } from 'vitest'
import { validateProjectCreateFields } from '@/components/org/project-create/validation'

const base = {
  name: 'Shop',
  description: '',
  environmentName: 'production',
  workspaceMode: 'existing' as const,
  pickedWorkspaceId: 'ws-1',
  allowedWorkspaceIds: ['ws-1'],
  newWorkspaceName: '',
  newWorkspaceNameOverridden: false,
  projectNames: [],
  workspaceNames: [],
}

describe('validateProjectCreateFields environment name', () => {
  it('accepts a normal environment name', () => {
    expect(validateProjectCreateFields(base)).toEqual({})
    expect(
      validateProjectCreateFields({ ...base, environmentName: 'Staging' }),
    ).toEqual({})
  })

  it('requires an environment name', () => {
    const errors = validateProjectCreateFields({
      ...base,
      environmentName: '  ',
    })
    expect(errors.environmentName).toBe('Environment name is required.')
    expect(errors.name).toBeUndefined()
  })

  it('rejects control characters', () => {
    const errors = validateProjectCreateFields({
      ...base,
      environmentName: 'a\u0000b',
    })
    expect(errors.environmentName).toMatch(/control characters/)
  })
})
