// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { rememberedProjectsType, useRememberedProjectsType } from '@/lib/remembered-projects-type'

const route = vi.hoisted(() => ({
  pathname: '/o/projects',
  params: {} as { type?: string },
}))

vi.mock('expo-router', () => ({
  usePathname: () => route.pathname,
  useGlobalSearchParams: () => route.params,
}))

describe('rememberedProjectsType', () => {
  it('reads ?type= on the Projects list', () => {
    expect(rememberedProjectsType('all', '/o/projects', 'o', 'managed')).toBe('managed')
    expect(rememberedProjectsType('managed', '/o/projects', 'o', undefined)).toBe('all')
    expect(rememberedProjectsType('all', '/o/projects', 'o', ['apps'])).toBe('apps')
  })

  it('keeps the last filter on the other tabs', () => {
    expect(rememberedProjectsType('managed', '/o/activity', 'o', undefined)).toBe('managed')
    expect(rememberedProjectsType('apps', '/o/servers', 'o', 'managed')).toBe('apps')
  })

  it('ignores a type that is not a filter', () => {
    expect(rememberedProjectsType('all', '/o/projects', 'o', 'bogus')).toBe('all')
  })
})

describe('useRememberedProjectsType', () => {
  it('follows the list and keeps it after leaving for another tab', () => {
    route.pathname = '/o/projects'
    route.params = { type: 'managed' }
    const { result, rerender } = renderHook(() => useRememberedProjectsType('o'))
    expect(result.current).toBe('managed')
    route.pathname = '/o/activity'
    route.params = {}
    rerender()
    expect(result.current).toBe('managed')
    route.pathname = '/o/projects'
    rerender()
    expect(result.current).toBe('all')
  })
})
