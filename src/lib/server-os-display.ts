import type { ServerOsMetadata } from '@/lib/instance-api'

function titleCaseWord(word: string): string {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function titleCasePhrase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(' ')
}

function isRaspberryPiOs(os: ServerOsMetadata): boolean {
  if (os.variant === 'raspberry-pi-os') return true
  const id = os.id?.toLowerCase()
  return id === 'raspbian' || id === 'raspberrypi' || id === 'raspios'
}

const OS_ID_PRODUCT_NAMES: Record<string, string> = {
  debian: 'Debian',
  ubuntu: 'Ubuntu',
  freebsd: 'FreeBSD',
  windows: 'Windows',
}

const OS_FAMILY_PRODUCT_NAMES: Record<
  NonNullable<ServerOsMetadata['family']>,
  string
> = {
  freebsd: 'FreeBSD',
  windows: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

function productNameFromOs(os: ServerOsMetadata): string | undefined {
  if (isRaspberryPiOs(os)) return 'Raspberry Pi OS'
  const id = os.id?.toLowerCase()
  if (id && OS_ID_PRODUCT_NAMES[id]) return OS_ID_PRODUCT_NAMES[id]
  if (os.id) return titleCasePhrase(os.id)
  const fromName = os.prettyName?.trim()
  if (fromName) {
    const first = fromName.split(/\s+/)[0]
    if (first && first.toLowerCase() !== 'gnu') return titleCaseWord(first)
  }
  if (os.family) return OS_FAMILY_PRODUCT_NAMES[os.family]
  return undefined
}

function productNameFromDisplay(osDisplay: string): string {
  const product = osDisplay.split(/\s+\d/)[0]?.trim()
  return product || osDisplay
}

/** Short product label for the OS column (logo + name), e.g. Debian, FreeBSD, Windows. */
export function formatServerOsProductName(
  os: ServerOsMetadata | null | undefined,
  osDisplay?: string | null,
): string | null {
  if (os) {
    const product = productNameFromOs(os)
    if (product) return product
  }
  const display = osDisplay?.trim()
  if (!display) return null
  return productNameFromDisplay(display)
}
