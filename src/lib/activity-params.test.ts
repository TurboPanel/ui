import { describe, expect, it } from 'vitest'
import { activityParamsToUrl, readActivityParams } from '@/lib/activity-params'

const PROJECT = '0192f000-0000-7000-8000-00000000000a'
const ENV = '0192f000-0000-7000-8000-00000000000b'

describe('activity URL params', () => {
  it('round-trips every filter, dropping defaults from the address', () => {
    const view = {
      filter: 'deploying',
      projectId: PROJECT,
      environmentId: ENV,
      offset: 50,
    } as const
    const url = activityParamsToUrl(view)
    expect(url).toEqual({ status: 'in-progress', project: PROJECT, environment: ENV, offset: '50' })
    expect(readActivityParams(url as Record<string, string>)).toEqual(view)
    expect(
      activityParamsToUrl({ filter: 'all', projectId: '', environmentId: '', offset: 0 })
    ).toEqual({ status: undefined, project: undefined, environment: undefined, offset: undefined })
  })

  it('falls back to everything on a malformed address', () => {
    expect(readActivityParams({ status: 'deploying', project: 'x', offset: '1e3' })).toEqual({
      filter: 'all',
      projectId: '',
      environmentId: '',
      offset: 0,
    })
    // an environment only counts inside a chosen project
    expect(readActivityParams({ environment: ENV }).environmentId).toBe('')
    expect(readActivityParams({ status: ['failed', 'succeeded'] }).filter).toBe('failed')
  })
})
