import { describe, expect, it } from 'vitest'
import type { CacheRecord } from '@/lib/instance-api'
import { statusInfo } from '@/lib/v4/status-vocab'
import {
  cacheAccessLabel,
  cacheAccountChoices,
  cacheFormDiffers,
  cacheFormError,
  cacheFormFor,
  cacheMemoryLabel,
  cacheRowSub,
  cacheStatusKey,
  cacheVariableNames,
  cacheVariablePreview,
  createCacheBody,
  emptyCacheForm,
  updateCacheBody,
  validateCacheMemory,
  validateCacheName,
  validateCachePrefix,
} from '@/lib/v4/project-caches'

const cache: CacheRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'sessions',
  engine: 'valkey',
  version: '8.1',
  status: 'ready',
  access: 'socket',
  port: null,
  maxMemoryMb: 64,
  keyPrefix: 'REDIS',
  principalId: '22222222-2222-4222-8222-222222222222',
  hostingAccount: 'blog',
  serverId: '33333333-3333-4333-8333-333333333333',
  variables: [],
  runtimeVersion: null,
  lastError: null,
  appliedAt: null,
  createdAt: '2026-11-11T00:00:00.000Z',
}

describe('cache words', () => {
  it('maps every status to a chip word', () => {
    const words = (['pending', 'applying', 'ready', 'failed', 'stopped'] as const).map(
      (status) => statusInfo(cacheStatusKey(status)).label
    )
    expect(words).toEqual(['Waiting for Deploy', 'Starting', 'Ready', 'Failed', 'Stopped'])
    expect(statusInfo(cacheStatusKey('mystery' as CacheRecord['status'])).label).toBe('Unknown')
  })

  it('names the access and the memory', () => {
    expect(cacheAccessLabel(cache)).toBe('Private Socket')
    expect(cacheAccessLabel({ access: 'port', port: 18234 })).toBe('Port 18234')
    expect(cacheMemoryLabel(64)).toBe('64 MiB')
    expect(cacheRowSub(cache)).toBe('64 MiB · blog')
  })
})

describe('variable names', () => {
  it('lists the socket names without a URL', () => {
    expect(cacheVariableNames('REDIS', 'socket')).toEqual([
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_SOCKET',
      'REDIS_USERNAME',
      'REDIS_PASSWORD',
    ])
  })

  it('lists the port names with a URL and no socket', () => {
    expect(cacheVariableNames('SESS', 'port')).toEqual([
      'SESS_HOST',
      'SESS_PORT',
      'SESS_USERNAME',
      'SESS_PASSWORD',
      'SESS_URL',
    ])
  })

  it('previews nothing for a prefix the control plane would refuse', () => {
    expect(cacheVariablePreview('1BAD', 'socket')).toEqual([])
    expect(cacheVariablePreview('', 'port')).toEqual([])
    expect(cacheVariablePreview('QUEUE', 'socket')[0]).toBe('QUEUE_HOST')
  })
})

describe('checks', () => {
  it('accepts and refuses names like the control plane', () => {
    expect(validateCacheName('sessions-2')).toBeNull()
    expect(validateCacheName('Sessions')).not.toBeNull()
    expect(validateCacheName('2fast')).not.toBeNull()
    expect(validateCacheName('')).not.toBeNull()
    expect(validateCacheName('a'.repeat(64))).not.toBeNull()
  })

  it('accepts and refuses prefixes', () => {
    expect(validateCachePrefix('REDIS')).toBeNull()
    expect(validateCachePrefix('_cache1')).toBeNull()
    expect(validateCachePrefix('1REDIS')).not.toBeNull()
    expect(validateCachePrefix('RE-DIS')).not.toBeNull()
  })

  it('keeps memory to whole MiB from 16 to 4096', () => {
    expect(validateCacheMemory('64')).toBeNull()
    expect(validateCacheMemory(' 4096 ')).toBeNull()
    expect(validateCacheMemory('15')).not.toBeNull()
    expect(validateCacheMemory('4097')).not.toBeNull()
    expect(validateCacheMemory('6.5')).not.toBeNull()
    expect(validateCacheMemory('')).not.toBeNull()
    expect(validateCacheMemory('-64')).not.toBeNull()
  })
})

describe('request bodies', () => {
  it('builds the add body from the form', () => {
    const form = { ...emptyCacheForm(cache.principalId), name: ' sessions ', memory: '128' }
    expect(createCacheBody(form)).toEqual({
      name: 'sessions',
      principalId: cache.principalId,
      access: 'socket',
      maxMemoryMb: 128,
      keyPrefix: 'REDIS',
    })
  })

  it('does not build an add body without a Hosting Account or with a bad name', () => {
    expect(createCacheBody({ ...emptyCacheForm(null), name: 'a' })).toBeNull()
    expect(createCacheBody({ ...emptyCacheForm('x'), name: 'A' })).toBeNull()
    expect(cacheFormError(emptyCacheForm(null), true)).toBe(
      'Use lower case letters, digits and dashes, starting with a letter.'
    )
    expect(cacheFormError({ ...emptyCacheForm(null), name: 'a' }, true)).toBe(
      'Choose a Hosting Account.'
    )
  })

  it('sends only what changed, and nothing when nothing did', () => {
    const form = cacheFormFor(cache)
    expect(updateCacheBody(cache, form)).toBeNull()
    expect(updateCacheBody(cache, { ...form, memory: '256' })).toEqual({ maxMemoryMb: 256 })
    expect(updateCacheBody(cache, { ...form, access: 'port', prefix: 'SESS' })).toEqual({
      access: 'port',
      keyPrefix: 'SESS',
    })
    expect(updateCacheBody(cache, { ...form, memory: '8' })).toBeNull()
  })
})

describe('edit differences', () => {
  it('sees a change even when the new value is invalid', () => {
    const form = cacheFormFor(cache)
    expect(cacheFormDiffers(cache, form)).toBe(false)
    expect(cacheFormDiffers(cache, { ...form, memory: '5' })).toBe(true)
    expect(cacheFormDiffers(cache, { ...form, prefix: '1BAD' })).toBe(true)
    expect(cacheFormDiffers(cache, { ...form, memory: ' 64 ' })).toBe(false)
    expect(cacheFormDiffers(cache, { ...form, access: 'port' })).toBe(true)
  })
})

describe('Hosting Account choices', () => {
  it('offers the accounts a site or app of this environment runs as', () => {
    const principals = [
      { id: 'a', username: 'blog', serviceIds: ['s1'] },
      { id: 'b', username: 'shop', serviceIds: ['other'] },
      { id: 'c', username: 'idle', serviceIds: [] },
    ]
    expect(cacheAccountChoices(principals, ['s1', 's2'])).toEqual([{ id: 'a', name: 'blog' }])
    expect(cacheAccountChoices(principals, [])).toEqual([])
  })
})
