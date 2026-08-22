import { describe, expect, it } from 'vitest'
import {
  CONTAINER_LOG_PAGE_LIMIT,
  DEFAULT_CONTAINER_LOG_FILTER_DRAFT,
  containerLogEventsToTranscriptLines,
  isContainerLogPageAtCeiling,
  resolveContainerLogTimeWindow,
  toContainerLogQueryFilter,
  toContainerLogQueryKey,
  type ContainerLogFilterDraft,
} from '@/lib/container-log-query'
import type { ContainerLogEventRecord } from '@/lib/instance-api'

const NOW = Date.parse('2026-08-22T12:00:00.000Z')

function draft(
  overrides: Partial<ContainerLogFilterDraft> = {},
): ContainerLogFilterDraft {
  return { ...DEFAULT_CONTAINER_LOG_FILTER_DRAFT, ...overrides }
}

function event(
  overrides: Partial<ContainerLogEventRecord> = {},
): ContainerLogEventRecord {
  return {
    timestamp: '2026-08-22T11:59:00.000Z',
    organizationId: 'org-1',
    serverId: 'srv-1',
    environmentId: 'env-1',
    serviceId: 'svc-1',
    containerId: 'container-1',
    stream: 'stdout',
    message: 'hello',
    ...overrides,
  }
}

describe('resolveContainerLogTimeWindow', () => {
  it('defaults to a short window so opening the page is not a day-wide scan', () => {
    const window = resolveContainerLogTimeWindow(
      DEFAULT_CONTAINER_LOG_FILTER_DRAFT.rangeId,
      NOW,
    )
    expect(window.toMs - window.fromMs).toBe(900_000)
    expect(window.toIso).toBe('2026-08-22T12:00:00.000Z')
    expect(window.fromIso).toBe('2026-08-22T11:45:00.000Z')
  })

  it('widens with the selected range', () => {
    const window = resolveContainerLogTimeWindow('24h', NOW)
    expect(window.fromIso).toBe('2026-08-21T12:00:00.000Z')
  })
})

describe('toContainerLogQueryFilter', () => {
  const window = resolveContainerLogTimeWindow('1h', NOW)

  it('emits only the bounds and the page limit when nothing is filtered', () => {
    expect(toContainerLogQueryFilter(draft(), window)).toEqual({
      from: window.fromIso,
      to: window.toIso,
      limit: CONTAINER_LOG_PAGE_LIMIT,
    })
  })

  it('never emits a key outside the closed predicate set', () => {
    const filter = toContainerLogQueryFilter(
      draft({
        serverId: 'srv-1',
        environmentId: 'env-1',
        serviceId: 'svc-1',
        containerId: 'container-1',
        stream: 'stderr',
        search: 'ECONNREFUSED',
      }),
      window,
      'cursor-1',
    )
    expect(Object.keys(filter).sort()).toEqual([
      'containerId',
      'cursor',
      'environmentId',
      'from',
      'limit',
      'search',
      'serverId',
      'serviceId',
      'stream',
      'to',
    ])
  })

  it('omits blank predicates rather than sending empty values', () => {
    const filter = toContainerLogQueryFilter(
      draft({ serverId: '   ', search: '  ' }),
      window,
      '   ',
    )
    expect(filter).not.toHaveProperty('serverId')
    expect(filter).not.toHaveProperty('search')
    expect(filter).not.toHaveProperty('cursor')
  })

  it('treats the "all" stream as no stream predicate', () => {
    expect(
      toContainerLogQueryFilter(draft({ stream: 'all' }), window),
    ).not.toHaveProperty('stream')
    expect(
      toContainerLogQueryFilter(draft({ stream: 'stdout' }), window).stream,
    ).toBe('stdout')
  })

  it('trims predicates so a padded id still matches the store', () => {
    expect(
      toContainerLogQueryFilter(draft({ serverId: ' srv-1 ' }), window).serverId,
    ).toBe('srv-1')
  })
})

describe('toContainerLogQueryKey', () => {
  it('drops the cursor so every page of one window shares a cache entry', () => {
    const window = resolveContainerLogTimeWindow('1h', NOW)
    const first = toContainerLogQueryFilter(draft({ serverId: 'srv-1' }), window)
    const second = toContainerLogQueryFilter(
      draft({ serverId: 'srv-1' }),
      window,
      'cursor-2',
    )
    expect(toContainerLogQueryKey(second)).toEqual(
      toContainerLogQueryKey(first),
    )
    expect(toContainerLogQueryKey(second)).not.toHaveProperty('cursor')
  })

  it('separates windows that differ in any predicate', () => {
    const window = resolveContainerLogTimeWindow('1h', NOW)
    expect(
      toContainerLogQueryKey(
        toContainerLogQueryFilter(draft({ serverId: 'srv-1' }), window),
      ),
    ).not.toEqual(
      toContainerLogQueryKey(
        toContainerLogQueryFilter(draft({ serverId: 'srv-2' }), window),
      ),
    )
  })
})

describe('containerLogEventsToTranscriptLines', () => {
  it('reverses the newest-first page so the tail sits at the bottom', () => {
    const lines = containerLogEventsToTranscriptLines([
      event({ message: 'newest', timestamp: '2026-08-22T11:59:02.000Z' }),
      event({ message: 'oldest', timestamp: '2026-08-22T11:59:01.000Z' }),
    ])
    expect(lines.map((line) => line.message)).toEqual(['oldest', 'newest'])
  })

  it('assigns ascending synthetic sequences with unique row keys', () => {
    const lines = containerLogEventsToTranscriptLines([
      event({ message: 'b' }),
      event({ message: 'a' }),
    ])
    expect(lines.map((line) => line.seq)).toEqual([1, 2])
  })

  it('carries the timestamp and stream through and never a phase', () => {
    const [line] = containerLogEventsToTranscriptLines([
      event({ stream: 'stderr', timestamp: '2026-08-22T11:59:00.000Z' }),
    ])
    expect(line).toMatchObject({
      stream: 'stderr',
      timestamp: '2026-08-22T11:59:00.000Z',
      phase: null,
    })
  })

  it('strips ANSI rather than rendering escape codes as text', () => {
    const [line] = containerLogEventsToTranscriptLines([
      event({ message: '\u001B[31mred\u001B[0m' }),
    ])
    expect(line?.message).toBe('red')
  })

  it('returns nothing for an empty page', () => {
    expect(containerLogEventsToTranscriptLines([])).toEqual([])
  })
})

describe('isContainerLogPageAtCeiling', () => {
  it('is true only when a full page came back with more behind it', () => {
    expect(
      isContainerLogPageAtCeiling(CONTAINER_LOG_PAGE_LIMIT, true),
    ).toBe(true)
    expect(
      isContainerLogPageAtCeiling(CONTAINER_LOG_PAGE_LIMIT, false),
    ).toBe(false)
    expect(isContainerLogPageAtCeiling(3, true)).toBe(false)
  })
})
