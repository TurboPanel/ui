/** Common x86_64 Linux page size (`getconf PAGESIZE`). */
export const DEFAULT_MEMORY_PAGE_SIZE_BYTES = 4096

export const MEMORY_PAGE_SIZE_NOT_REPORTED = 'Not reported yet'

export const MEMORY_PAGE_SIZE_KERNEL_SWITCH_HINT =
  'ProxySQL needs 4 KiB pages; see the kernel switch docs.'

function isReportedPageSize(pageSizeBytes: number | null | undefined): pageSizeBytes is number {
  return pageSizeBytes != null && Number.isInteger(pageSizeBytes) && pageSizeBytes > 0
}

/** `4096` → `4 KiB`. Missing or invalid values stay `Not reported yet`. */
export function formatMemoryPageSize(pageSizeBytes: number | null | undefined): string {
  if (!isReportedPageSize(pageSizeBytes)) return MEMORY_PAGE_SIZE_NOT_REPORTED
  const kib = pageSizeBytes / 1024
  if (Number.isInteger(kib)) return `${kib} KiB`
  return `${pageSizeBytes} B`
}

/** Hint when a reported page size is not the 4 KiB size the database proxy needs. */
export function memoryPageSizeHint(pageSizeBytes: number | null | undefined): string | null {
  if (!isReportedPageSize(pageSizeBytes)) return null
  if (pageSizeBytes === DEFAULT_MEMORY_PAGE_SIZE_BYTES) return null
  return MEMORY_PAGE_SIZE_KERNEL_SWITCH_HINT
}
