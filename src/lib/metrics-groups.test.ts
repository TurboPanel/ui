import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GROUP_SUMMARY_SPECS, HOST_CHART_GROUPS } from './metrics-groups'

/**
 * Chart ids are read out of the component source rather than imported: the
 * component pulls in react-native, which this vitest project cannot parse.
 * The definitions are a flat literal list, so a source scan is exact.
 */
function definedChartIds(): Set<string> {
  const source = readFileSync(
    fileURLToPath(new URL('../components/org/server-metrics-section.tsx', import.meta.url)),
    'utf8'
  )
  const block = source.slice(
    source.indexOf('const HOST_CHART_DEFINITIONS'),
    source.indexOf('// Per-entity chart builders')
  )
  return new Set([...block.matchAll(/^ {4}id: '([a-z0-9-]+)',$/gm)].map((match) => match[1]!))
}

describe('host chart groups', () => {
  const defined = definedChartIds()

  it('finds the chart definitions it is checking against', () => {
    // Guards the source scan itself: a refactor that moves the definitions
    // must not turn this suite into a no-op that passes vacuously.
    expect(defined.size).toBeGreaterThan(20)
    expect(defined.has('cpu-modes')).toBe(true)
  })

  it('references only charts that actually exist', () => {
    const missing = HOST_CHART_GROUPS.flatMap((group) =>
      group.chartIds.filter((id) => !defined.has(id)).map((id) => `${group.id} -> ${id}`)
    )
    expect(missing).toEqual([])
  })

  it('places every defined chart in exactly one group', () => {
    const placements = new Map<string, string[]>()
    for (const group of HOST_CHART_GROUPS) {
      for (const id of group.chartIds) {
        placements.set(id, [...(placements.get(id) ?? []), group.id])
      }
    }
    const orphaned = [...defined].filter((id) => !placements.has(id))
    const duplicated = [...placements.entries()]
      .filter(([, groups]) => groups.length > 1)
      .map(([id, groups]) => `${id} in ${groups.join(', ')}`)
    expect({ orphaned, duplicated }).toEqual({ orphaned: [], duplicated: [] })
  })

  it('uses unique group ids', () => {
    const ids = HOST_CHART_GROUPS.map((group) => group.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('summarises only real groups, from charts those groups contain', () => {
    for (const [groupId, spec] of Object.entries(GROUP_SUMMARY_SPECS)) {
      const group = HOST_CHART_GROUPS.find((candidate) => candidate.id === groupId)
      expect(group, `summary spec for unknown group ${groupId}`).toBeDefined()
      expect(
        group!.chartIds.includes(spec.chartId),
        `${groupId} summarises ${spec.chartId}, which is not in that group`
      ).toBe(true)
    }
  })

  it('reads Router reachability as backends up against backends total', () => {
    // Both series ids must exist on the `router-backends` definition, which
    // the id scan above cannot see — pin them here so a series rename is caught.
    expect(GROUP_SUMMARY_SPECS.router).toEqual({
      chartId: 'router-backends',
      reachability: { upSeriesId: 'up', totalSeriesId: 'total' },
    })
    const source = readFileSync(
      fileURLToPath(new URL('../components/org/server-metrics-section.tsx', import.meta.url)),
      'utf8'
    )
    const start = source.indexOf("id: 'router-backends'")
    const block = source.slice(start, source.indexOf('hideWhenEmpty', start))
    expect(block).toContain("id: 'up'")
    expect(block).toContain("id: 'total'")
  })

  it('surfaces the router config reload age alongside the reload count', () => {
    const router = HOST_CHART_GROUPS.find((group) => group.id === 'router')
    expect(router?.chartIds).toContain('router-config')
    expect(router?.chartIds).toContain('router-config-age')
  })

  it('keeps the out-of-RAM signals together in Paging', () => {
    const paging = HOST_CHART_GROUPS.find((group) => group.id === 'paging')
    expect(paging?.chartIds).toEqual(['memory-swap-io', 'memory-major-faults'])
  })
})
