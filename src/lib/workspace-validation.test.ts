import { describe, expect, it } from 'vitest'
import {
  validateWorkspaceDescription,
  validateWorkspaceName,
} from '@/lib/workspace-validation'
import {
  DESCRIPTION_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
} from '@/lib/display-name'

describe('validateWorkspaceName', () => {
  it('accepts normal workspace names', () => {
    expect(validateWorkspaceName('Default Workspace')).toBeNull()
    expect(validateWorkspaceName("O'Reilly Labs")).toBeNull()
  })

  it('rejects empty and control characters', () => {
    expect(validateWorkspaceName('')).toBe('Name is required.')
    expect(validateWorkspaceName('   ')).toBe('Name is required.')
    expect(validateWorkspaceName('bad\nname')).toBe(
      'Name cannot contain control characters.',
    )
  })

  it('rejects over-length names', () => {
    expect(validateWorkspaceName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(
      `Name must be ${String(DISPLAY_NAME_MAX_LENGTH)} characters or fewer.`,
    )
  })
})

describe('validateWorkspaceDescription', () => {
  it('accepts empty and short descriptions', () => {
    expect(validateWorkspaceDescription('')).toBeNull()
    expect(validateWorkspaceDescription('Team shared projects')).toBeNull()
  })

  it('rejects over-length descriptions', () => {
    expect(
      validateWorkspaceDescription('a'.repeat(DESCRIPTION_MAX_LENGTH + 1)),
    ).toBe(
      `Description must be ${String(DESCRIPTION_MAX_LENGTH)} characters or fewer.`,
    )
  })

  it('rejects control characters in descriptions', () => {
    expect(validateWorkspaceDescription('bad\ndesc')).toBe(
      'Description cannot contain control characters.',
    )
  })
})
