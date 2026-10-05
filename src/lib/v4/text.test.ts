import { describe, expect, it } from 'vitest'
import { isAppService, isDataStoreContainer, serviceKindLabel } from './service-roles'
import { joinNames, plural, slugify } from './text'

describe('text helpers', () => {
  it('pluralises', () => {
    expect(plural(1, 'change')).toBe('1 change')
    expect(plural(0, 'change')).toBe('0 changes')
    expect(plural(2, 'data store')).toBe('2 data stores')
    expect(plural(2, 'person', 'people')).toBe('2 people')
  })

  it('joins names the way a sentence does', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Production'])).toBe('Production')
    expect(joinNames(['Production', 'Staging'])).toBe('Production and Staging')
    expect(joinNames(['A', 'B', 'C'])).toBe('A, B and C')
    expect(joinNames(['A', '', 'C'])).toBe('A and C')
  })

  it('makes url-safe names', () => {
    expect(slugify('turbopanel-website')).toBe('turbopanel-website')
    expect(slugify('  My Shop! ')).toBe('my-shop')
    expect(slugify('***')).toBe('env')
    expect(slugify('')).toBe('env')
  })
})

describe('service roles', () => {
  it('tells apps from data', () => {
    expect(isAppService({ id: 'a', name: 'a', kind: 'node' })).toBe(true)
    expect(isAppService({ id: 'a', name: 'a', kind: 'container', image: 'build: ./api' })).toBe(true)
    expect(isAppService({ id: 'r', name: 'r', kind: 'container', image: 'redis:8' })).toBe(false)
    expect(isAppService({ id: 'd', name: 'd', kind: 'database' })).toBe(false)
    expect(isDataStoreContainer({ id: 'p', name: 'p', kind: 'container', image: 'postgres:17' })).toBe(true)
    expect(isDataStoreContainer({ id: 'p', name: 'p', kind: 'container' })).toBe(false)
    expect(isDataStoreContainer({ id: 'p', name: 'p', kind: 'node', image: 'redis' })).toBe(false)
  })

  it('names each kind in plain words', () => {
    expect(serviceKindLabel('node')).toBe('Node.js app')
    expect(serviceKindLabel('site')).toBe('Website')
    expect(serviceKindLabel('container')).toBe('Container')
    expect(serviceKindLabel('database')).toBe('Database we run and back up for you')
  })
})
