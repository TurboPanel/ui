import { describe, expect, it } from 'vitest'
import {
  afterCreateHref,
  moreWaysOpenFor,
  primaryActionForChoice,
} from '@/lib/project-create/new-project-flow'

describe('primaryActionForChoice', () => {
  it('creates a repository project from this screen', () => {
    expect(primaryActionForChoice('repository')).toEqual({
      kind: 'create-from-repository',
      label: 'Continue',
    })
  })

  it('opens the Compose editor for Compose, Service forms and Hosting upload', () => {
    for (const choice of ['compose', 'services', 'hosting'] as const) {
      expect(primaryActionForChoice(choice)).toEqual({ kind: 'open-compose', label: 'Continue' })
    }
  })

  it('creates a template or a managed database straight from the pick', () => {
    for (const choice of ['template', 'managed'] as const) {
      expect(primaryActionForChoice(choice)).toEqual({
        kind: 'create-from-catalog',
        label: 'Create project',
      })
    }
  })

  it('does nothing until a card is picked', () => {
    expect(primaryActionForChoice(null).kind).toBeNull()
  })
})

describe('moreWaysOpenFor', () => {
  it('opens the list when a link picked one of its cards', () => {
    expect(moreWaysOpenFor('hosting')).toBe(true)
    expect(moreWaysOpenFor('template')).toBe(true)
    expect(moreWaysOpenFor('services')).toBe(true)
  })

  it('stays closed for the three main cards and for no pick', () => {
    expect(moreWaysOpenFor('repository')).toBe(false)
    expect(moreWaysOpenFor('compose')).toBe(false)
    expect(moreWaysOpenFor('managed')).toBe(false)
    expect(moreWaysOpenFor(null)).toBe(false)
  })
})

describe('afterCreateHref', () => {
  it('sends a Compose project on to set up its first environment', () => {
    expect(afterCreateHref('o', 'p', 'docker-compose')).toBe('/o/projects/p/setup/environment')
  })

  it('opens a template or managed project on the project itself', () => {
    expect(afterCreateHref('o', 'p', 'managed')).toBe('/o/projects/p')
    expect(afterCreateHref('o', 'p', 'template')).toBe('/o/projects/p')
  })
})
