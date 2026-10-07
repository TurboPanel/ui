import { describe, expect, it } from 'vitest'
import type { TlsSource, TlsStatus } from './instance-api'
import {
  coveringCertificates,
  type PickerCertificate,
  pinnedCertificateGap,
} from './hosting-tls-picker'

function cert(
  id: string,
  source: TlsSource,
  dnsNames: string[],
  status: TlsStatus = 'ready'
): PickerCertificate {
  return { id, source, metadata: { status, dnsNames } }
}

const letsEncrypt = cert('le', 'lets_encrypt', ['turbopanel.io'], 'managed')
const uploadBare = cert('up-bare', 'upload', ['turbopanel.io'])
const uploadBoth = cert('up-both', 'upload', ['turbopanel.io', 'www.turbopanel.io'])
const wildcard = cert('wild', 'organization_ca', ['*.turbopanel.io', 'turbopanel.io'])
const expired = cert('old', 'upload', ['turbopanel.io', 'www.turbopanel.io'], 'expired')
const rows = [letsEncrypt, uploadBare, uploadBoth, wildcard, expired]

const ids = (list: readonly PickerCertificate[]) => list.map((row) => row.id)

describe('coveringCertificates', () => {
  it('checks every name for an upload, only the typed ones for Let’s Encrypt', () => {
    // The preselect on a new hosting adds www.turbopanel.io.
    expect(ids(coveringCertificates(rows, 'turbopanel.io', null))).toEqual([
      'le',
      'up-both',
      'wild',
    ])
    expect(ids(coveringCertificates(rows, 'turbopanel.io', 'off'))).toEqual([
      'le',
      'up-bare',
      'up-both',
      'wild',
    ])
  })

  it('matches mixed-case hostnames, including the added www name', () => {
    expect(ids(coveringCertificates(rows, 'Turbopanel.IO', 'both'))).toEqual([
      'le',
      'up-both',
      'wild',
    ])
  })

  it('offers nothing for an empty field or names nothing covers', () => {
    expect(coveringCertificates(rows, ' , ', 'both')).toEqual([])
    expect(coveringCertificates(rows, 'other.io', 'off')).toEqual([])
  })
})

describe('pinnedCertificateGap', () => {
  it('is null when nothing is pinned, the pin is gone, or it still covers', () => {
    expect(pinnedCertificateGap(rows, null, 'turbopanel.io', 'both')).toBeNull()
    expect(pinnedCertificateGap(rows, 'missing', 'turbopanel.io', 'both')).toBeNull()
    expect(pinnedCertificateGap(rows, 'up-both', 'turbopanel.io', 'both')).toBeNull()
    expect(pinnedCertificateGap(rows, 'up-bare', '', 'both')).toBeNull()
    // Let's Encrypt issues the added www name its own certificate.
    expect(pinnedCertificateGap(rows, 'le', 'turbopanel.io', 'www-to-root')).toBeNull()
  })

  it('keeps an upload that misses the www name and says to change the www choice', () => {
    const gap = pinnedCertificateGap(rows, 'up-bare', 'Turbopanel.io', 'www-to-root')
    expect(gap?.row).toBe(uploadBare)
    expect(gap?.missing).toEqual(['www.turbopanel.io'])
    expect(gap?.note).toBe(
      'This certificate doesn’t cover www.turbopanel.io, so the deploy will be refused. Pick another or change the www choice.'
    )
  })

  it('says to change the hostnames when a typed name is not covered', () => {
    const gap = pinnedCertificateGap(rows, 'le', 'turbopanel.io, app.io', 'off')
    expect(gap?.missing).toEqual(['app.io'])
    expect(gap?.note).toBe(
      'This certificate doesn’t cover app.io, so the deploy will be refused. Pick another or change the hostnames.'
    )
  })
})
