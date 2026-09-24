const STORAGE_KEY = 'turbopanel_upgrade_cp_watch'

export function markControlPlaneUpgradeWatch(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, '1')
}

export function clearControlPlaneUpgradeWatch(): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isControlPlaneUpgradeWatchActive(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  return sessionStorage.getItem(STORAGE_KEY) === '1'
}
