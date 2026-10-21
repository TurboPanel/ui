import * as Clipboard from 'expo-clipboard'
import { downloadOrganizationCaPem } from '@/lib/instance-api'

/**
 * File name for a saved Organization CA bundle; matches the control plane's
 * `GET /tls/ca/download` attachment name, so several organizations' files do
 * not overwrite each other.
 */
export function organizationCaFileName(orgId: string): string {
  return `turbopanel-org-ca-${orgId}.pem`
}

/**
 * Fetch the Organization CA bundle of `orgId`, copy it to the clipboard, and —
 * on web, where `document` exists — also save it as a `.pem` file download
 * named after the organization.
 */
export async function downloadCaBundle(orgId: string): Promise<void> {
  const pem = await downloadOrganizationCaPem(orgId)
  await Clipboard.setStringAsync(pem)
  if (typeof document === 'undefined') return
  const blob = new Blob([pem], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = organizationCaFileName(orgId)
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Success copy matching {@link downloadCaBundle}: web gets a file too. */
export function downloadSuccessMessage(): string {
  if (typeof document !== 'undefined') {
    return 'Organization CA copied and downloaded'
  }
  return 'Organization CA copied'
}
