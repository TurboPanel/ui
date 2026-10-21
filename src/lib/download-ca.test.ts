import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadOrganizationCaPem } from '@/lib/instance-api'
import * as Clipboard from 'expo-clipboard'
import { downloadCaBundle, downloadSuccessMessage, organizationCaFileName } from './download-ca'

vi.mock('@/lib/instance-api', () => ({
  downloadOrganizationCaPem: vi.fn(),
}))

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(),
}))

const ORG_ID = '019a2b3c-4d5e-7f60-8a7b-9c0d1e2f3a4b'

const SAMPLE_PEM = String.raw`-----BEGIN CERTIFICATE-----
MIIBTEST
-----END CERTIFICATE-----
`

describe('download-ca', () => {
  beforeEach(() => {
    vi.mocked(downloadOrganizationCaPem).mockResolvedValue(SAMPLE_PEM)
    vi.mocked(Clipboard.setStringAsync).mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('downloadCaBundle', () => {
    it('copies PEM and triggers a web download when document exists', async () => {
      const click = vi.fn()
      const anchor = { href: '', download: '', click }
      const createElement = vi.fn(() => anchor)
      const createObjectURL = vi.fn((_blob: Blob) => 'blob:org-ca')
      const revokeObjectURL = vi.fn()

      vi.stubGlobal('document', { createElement })
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

      await downloadCaBundle(ORG_ID)

      expect(downloadOrganizationCaPem).toHaveBeenCalledExactlyOnceWith(ORG_ID)
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(SAMPLE_PEM)
      expect(createElement).toHaveBeenCalledWith('a')
      expect(createObjectURL).toHaveBeenCalledOnce()
      const blobArg = createObjectURL.mock.calls[0]?.[0]
      if (!(blobArg instanceof Blob)) {
        throw new TypeError('expected Blob argument to createObjectURL')
      }
      expect(blobArg.type).toBe('application/x-pem-file')
      expect(anchor.href).toBe('blob:org-ca')
      expect(anchor.download).toBe(`turbopanel-org-ca-${ORG_ID}.pem`)
      expect(click).toHaveBeenCalledOnce()
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:org-ca')
    })

    it('copies PEM without creating a download when document is absent', async () => {
      vi.stubGlobal('document', undefined)

      const createObjectURL = vi.fn()
      vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })

      await downloadCaBundle(ORG_ID)

      expect(downloadOrganizationCaPem).toHaveBeenCalledExactlyOnceWith(ORG_ID)
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(SAMPLE_PEM)
      expect(createObjectURL).not.toHaveBeenCalled()
    })
  })

  describe('organizationCaFileName', () => {
    it('names the file after the organization id and keeps the .pem extension', () => {
      expect(organizationCaFileName(ORG_ID)).toBe(`turbopanel-org-ca-${ORG_ID}.pem`)
    })
  })

  describe('downloadSuccessMessage', () => {
    it('mentions download when document exists', () => {
      vi.stubGlobal('document', {})
      expect(downloadSuccessMessage()).toBe('Organization CA copied and downloaded')
    })

    it('mentions copy only when document is absent', () => {
      vi.stubGlobal('document', undefined)
      expect(downloadSuccessMessage()).toBe('Organization CA copied')
    })
  })
})
