import { describe, expect, it } from 'vitest'
import {
  parseServiceTurbopanelExtension,
  patchServiceTurbopanelExtension,
  SERVICE_DESCRIPTION_MAX_LENGTH,
} from './service-kind'

describe('patchServiceTurbopanelExtension description', () => {
  it('stores a trimmed description within the max length', () => {
    const next = patchServiceTurbopanelExtension(
      { image: 'nginx' },
      { description: '  API gateway  ' },
    )
    expect(next['x-turbopanel']).toEqual({ description: 'API gateway' })
  })

  it('truncates an overlong description so parse never drops it', () => {
    const overlong = `${'x'.repeat(SERVICE_DESCRIPTION_MAX_LENGTH)}EXTRA`
    const next = patchServiceTurbopanelExtension(
      { image: 'nginx' },
      { description: overlong },
    )
    const extension = next['x-turbopanel'] as Record<string, unknown>
    expect(typeof extension.description).toBe('string')
    expect((extension.description as string).length).toBe(
      SERVICE_DESCRIPTION_MAX_LENGTH,
    )
    expect(
      parseServiceTurbopanelExtension(extension)?.description,
    ).toBe(extension.description)
  })

  it('clears description when empty after trim', () => {
    const next = patchServiceTurbopanelExtension(
      {
        image: 'nginx',
        'x-turbopanel': { description: 'was here' },
      },
      { description: '   ' },
    )
    expect(Object.hasOwn(next, 'x-turbopanel')).toBe(false)
  })
})
