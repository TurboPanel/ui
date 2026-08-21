import * as Clipboard from 'expo-clipboard'
import { downloadOrganizationCaPem } from '@/lib/instance-api'

/**
 * Fetch the Organization CA bundle, copy it to the clipboard, and — on web,
 * where `document` exists — also save it as a `.pem` file download.
 */
export async function downloadCaBundle(): Promise<void> {
  const pem = await downloadOrganizationCaPem()
  await Clipboard.setStringAsync(pem)
  if (typeof document === 'undefined') return
  const blob = new Blob([pem], { type: 'application/x-pem-file' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'turbopanel-org-ca.pem'
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
