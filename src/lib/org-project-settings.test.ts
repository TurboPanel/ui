import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrgProjectSettings, saveOrgProjectSettings } from '@/lib/instance-api'
import { setActiveOrganizationId } from '@/lib/org-context'
import {
  CLOSED_PROJECT_FORM_SECTIONS,
  overlaySavedSwitch,
  projectFormSectionOpen,
  useOrgProjectFormDefaults,
} from '@/lib/org-project-settings'

const useQueryMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}))

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  useQueryMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setActiveOrganizationId(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('overlaySavedSwitch', () => {
  // The other switch differs between the cache and the answer, as when a
  // slower answer for it is still on its way.
  const SAVED = { openEnvironmentSectionByDefault: true, openWorkspaceSectionByDefault: false }

  it('changes only the saved switch in an entry the cache holds', () => {
    expect(
      overlaySavedSwitch(
        { openEnvironmentSectionByDefault: false, openWorkspaceSectionByDefault: true },
        'openEnvironmentSectionByDefault',
        SAVED
      )
    ).toEqual({ openEnvironmentSectionByDefault: true, openWorkspaceSectionByDefault: true })
  })

  it("fills an entry that was never fetched from the save's answer", () => {
    expect(
      overlaySavedSwitch(undefined, 'openEnvironmentSectionByDefault', {
        ...SAVED,
        ok: true,
      } as never)
    ).toEqual(SAVED)
  })
})

describe('projectFormSectionOpen', () => {
  it('follows the organization default until the person chooses', () => {
    expect(projectFormSectionOpen(null, false, false)).toBe(false)
    expect(projectFormSectionOpen(null, true, false)).toBe(true)
    expect(projectFormSectionOpen(true, false, false)).toBe(true)
    expect(projectFormSectionOpen(false, true, false)).toBe(false)
  })

  it('always opens a section with an error in it', () => {
    expect(projectFormSectionOpen(false, false, true)).toBe(true)
    expect(projectFormSectionOpen(null, false, true)).toBe(true)
  })
})

describe('project settings wrappers', () => {
  it('read and write /organizations/:id/project-settings', async () => {
    const stored = { openEnvironmentSectionByDefault: false, openWorkspaceSectionByDefault: true }
    fetchMock.mockResolvedValueOnce(jsonResponse(stored))
    await expect(fetchOrgProjectSettings('org-1')).resolves.toEqual(stored)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      '/api/client/v1/organizations/org-1/project-settings'
    )

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ok: true, ...stored, openEnvironmentSectionByDefault: true })
    )
    await saveOrgProjectSettings('org-1', { openEnvironmentSectionByDefault: true })
    const [, init] = fetchMock.mock.calls[1] ?? []
    expect((init as RequestInit).method).toBe('PUT')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      openEnvironmentSectionByDefault: true,
    })
  })
})

describe('useOrgProjectFormDefaults', () => {
  function useCapturedQueryFn(): () => Promise<unknown> {
    useQueryMock.mockReturnValue({ data: undefined })
    useOrgProjectFormDefaults('org-1')
    const options = useQueryMock.mock.calls[0]?.[0] as { queryFn: () => Promise<unknown> }
    return options.queryFn
  }

  it('answers both sections closed until the switches load', () => {
    useQueryMock.mockReturnValue({ data: undefined })
    expect(useOrgProjectFormDefaults('org-1')).toEqual(CLOSED_PROJECT_FORM_SECTIONS)
  })

  it('answers the stored switches', () => {
    const stored = { openEnvironmentSectionByDefault: true, openWorkspaceSectionByDefault: false }
    useQueryMock.mockReturnValue({ data: stored })
    expect(useOrgProjectFormDefaults('org-1')).toEqual(stored)
  })

  it.each([403, 404])('reads a %i as both sections closed', async (status) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'no' }, status))
    await expect(useCapturedQueryFn()()).resolves.toEqual(CLOSED_PROJECT_FORM_SECTIONS)
  })

  it('passes any other failure on', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 500))
    await expect(useCapturedQueryFn()()).rejects.toThrow()
  })
})
