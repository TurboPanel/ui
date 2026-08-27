import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MANIFEST_WEB_ONLY_NOTE,
  submitGithubAppManifest,
} from '@/lib/github-manifest-submit'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('submitGithubAppManifest', () => {
  it('returns false when document is unavailable', () => {
    expect(typeof document).toBe('undefined')
    expect(
      submitGithubAppManifest('https://github.com/settings/apps/new', {
        name: 'TurboPanel',
      }),
    ).toBe(false)
  })

  it('POSTs the manifest through a hidden form and returns true', () => {
    const field = { type: '', name: '', value: '' }
    const form = {
      method: '',
      action: '',
      style: { display: '' },
      appendChild: vi.fn(),
      submit: vi.fn(),
      remove: vi.fn(),
    }
    const body = { appendChild: vi.fn() }
    const documentStub = {
      createElement: vi.fn((tag: string) => (tag === 'form' ? form : field)),
      body,
    }
    vi.stubGlobal('document', documentStub)

    const createUrl = 'https://github.com/settings/apps/new'
    const manifest = { name: 'TurboPanel', url: 'https://example.com' }
    expect(submitGithubAppManifest(createUrl, manifest)).toBe(true)

    expect(documentStub.createElement).toHaveBeenCalledWith('form')
    expect(documentStub.createElement).toHaveBeenCalledWith('input')
    expect(form.method).toBe('POST')
    expect(form.action).toBe(createUrl)
    expect(form.style.display).toBe('none')
    expect(field.type).toBe('hidden')
    expect(field.name).toBe('manifest')
    expect(field.value).toBe(JSON.stringify(manifest))
    expect(form.appendChild).toHaveBeenCalledWith(field)
    expect(body.appendChild).toHaveBeenCalledWith(form)
    expect(form.submit).toHaveBeenCalledOnce()
    expect(form.remove).toHaveBeenCalledOnce()
  })
})

describe('MANIFEST_WEB_ONLY_NOTE', () => {
  it('tells native callers to finish in a browser', () => {
    expect(MANIFEST_WEB_ONLY_NOTE).toContain('web browser')
    expect(MANIFEST_WEB_ONLY_NOTE).toContain('form')
  })
})
