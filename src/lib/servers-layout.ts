export const SERVERS_LAYOUTS = ['list', 'tiles'] as const

export type ServersLayout = (typeof SERVERS_LAYOUTS)[number]

export const DEFAULT_SERVERS_LAYOUT: ServersLayout = 'list'

const STORAGE_KEY = 'turbopanel.serversLayout'

/** CSS grid / wrap minimum so tiled host cards stay compact. */
export const SERVERS_TILE_MIN_WIDTH = 216

/** Icon-only toggle names — keep visible chrome unlabeled. */
export const SERVERS_LAYOUT_LABELS: Record<ServersLayout, string> = {
  list: 'Detail',
  tiles: 'Summary',
}

export function serversLayoutAccessibilityLabel(layout: ServersLayout): string {
  return `${SERVERS_LAYOUT_LABELS[layout]} view`
}

/**
 * Native phones (and tablets) stack Detail rows so the fleet list never
 * scrolls sideways. Web keeps the multi-column table.
 */
export function usesCompactServersList(platformOS: string): boolean {
  return platformOS !== 'web'
}

export type ServersFleetSurface = Readonly<{
  showToolbarSelectAll: boolean
  showDetailFleet: boolean
  showSummaryFleet: boolean
  showStatusPanel: boolean
  showDetailInPanel: boolean
  showFleetPanel: boolean
}>

/** Which fleet chrome to mount for the current layout and load state. */
export function resolveServersFleetSurface(input: {
  layout: ServersLayout
  serverCount: number
  compactChrome: boolean
  hasError: boolean
}): ServersFleetSurface {
  const hasServers = input.serverCount > 0
  const showDetailFleet = hasServers && input.layout === 'list'
  const showSummaryFleet = hasServers && input.layout === 'tiles'
  const showStatusPanel = input.hasError || !hasServers
  const showDetailInPanel = showDetailFleet && !input.compactChrome
  return {
    showToolbarSelectAll: hasServers && (showSummaryFleet || input.compactChrome),
    showDetailFleet,
    showSummaryFleet,
    showStatusPanel,
    showDetailInPanel,
    showFleetPanel: showStatusPanel || showDetailInPanel,
  }
}

export function showServersToolbarUpdate(
  canManage: boolean,
  compactChrome: boolean,
  selectedCount: number,
): boolean {
  if (!canManage) return false
  if (!compactChrome) return true
  return selectedCount > 0
}

export function parseServersLayout(
  value: string | null | undefined,
): ServersLayout {
  if (value === 'tiles' || value === 'summary') return 'tiles'
  return DEFAULT_SERVERS_LAYOUT
}

export function getStoredServersLayout(): ServersLayout {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_SERVERS_LAYOUT
  }
  return parseServersLayout(localStorage.getItem(STORAGE_KEY))
}

export function setStoredServersLayout(next: ServersLayout): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  localStorage.setItem(STORAGE_KEY, next)
}
