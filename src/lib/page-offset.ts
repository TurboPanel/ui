/**
 * The offset of the last page that has rows, when `offset` points past the
 * end (a stale `?offset=` in a link, or a list that shrank while it was open).
 * An offset inside the list, and an empty list, keep the offset as it is.
 */
export function clampPageOffset(offset: number, total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0 || offset < total) return Math.max(0, offset)
  return Math.floor((total - 1) / pageSize) * pageSize
}
