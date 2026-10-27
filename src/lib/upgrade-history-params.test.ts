import { describe, expect, it } from 'vitest'
import {
  historyParamsToUrl,
  readHistoryParams,
  readRunServerParams,
  runServerParamsToUrl,
  withQuery,
} from '@/lib/upgrade-history-params'

describe('history view in the URL', () => {
  it('reads defaults from an empty address', () => {
    expect(readHistoryParams({})).toEqual({ status: 'any', trigger: '', offset: 0 })
  })

  it('reads a deep link and ignores values it does not know', () => {
    expect(readHistoryParams({ status: 'failed', trigger: 'manual', offset: '50' })).toEqual({
      status: 'failed',
      trigger: 'manual',
      offset: 50,
    })
    expect(readHistoryParams({ status: 'bogus', trigger: 'x', offset: '-3' })).toEqual({
      status: 'any',
      trigger: '',
      offset: 0,
    })
    expect(readHistoryParams({ status: ['active', 'failed'], offset: '1e3' })).toEqual({
      status: 'active',
      trigger: '',
      offset: 0,
    })
  })

  it('leaves defaults out of the address', () => {
    expect(historyParamsToUrl({ status: 'any', trigger: '', offset: 0 })).toEqual({
      status: undefined,
      trigger: undefined,
      offset: undefined,
    })
    expect(historyParamsToUrl({ status: 'failed', trigger: 'automatic', offset: 25 })).toEqual({
      status: 'failed',
      trigger: 'automatic',
      offset: '25',
    })
  })
})

describe('run server view in the URL', () => {
  it('round-trips every field', () => {
    const view = {
      status: 'failed' as const,
      organizationId: 'org-1',
      q: 'web',
      sort: 'duration' as const,
      dir: 'desc' as const,
      offset: 100,
    }
    const url = runServerParamsToUrl(view)
    expect(url).toEqual({
      status: 'failed',
      org: 'org-1',
      q: 'web',
      sort: 'duration',
      dir: 'desc',
      offset: '100',
    })
    expect(readRunServerParams(url)).toEqual(view)
  })

  it('falls back to the default sort and drops unknown values', () => {
    expect(readRunServerParams({ sort: 'name', dir: 'up', status: 'gone', q: '  ' })).toEqual({
      status: '',
      organizationId: null,
      q: '',
      sort: 'status',
      dir: 'asc',
      offset: 0,
    })
  })

  it('builds a link that carries only the set parameters', () => {
    expect(withQuery('/a', { x: undefined, y: '' })).toBe('/a')
    expect(withQuery('/a', { status: 'failed', q: 'a b' })).toBe('/a?status=failed&q=a+b')
  })
})
