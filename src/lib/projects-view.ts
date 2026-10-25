import { useSyncExternalStore } from 'react'

/**
 * How the Projects page lists projects: as tiles in a grid or as rows in a
 * list. Stored per browser (localStorage); where storage is missing or
 * throws, the choice lasts for the session.
 */
export type ProjectsView = 'grid' | 'list'

export const PROJECTS_VIEWS: readonly ProjectsView[] = ['grid', 'list']

const STORAGE_KEY = 'turbopanel.projectsView'

export function parseProjectsView(value: string | null | undefined): ProjectsView {
  return value === 'list' ? 'list' : 'grid'
}

function readStored(): ProjectsView {
  try {
    if (typeof localStorage === 'undefined') return 'grid'
    return parseProjectsView(localStorage.getItem(STORAGE_KEY))
  } catch {
    return 'grid'
  }
}

function writeStored(view: ProjectsView): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, view)
  } catch {
    // Private windows and blocked storage: the choice still holds in memory.
  }
}

let current: ProjectsView = readStored()
const listeners = new Set<() => void>()

export function subscribeProjectsView(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getProjectsView(): ProjectsView {
  return current
}

export function setProjectsView(view: ProjectsView): void {
  if (view === current) return
  current = view
  writeStored(view)
  for (const listener of listeners) listener()
}

export function useProjectsView(): ProjectsView {
  return useSyncExternalStore(subscribeProjectsView, getProjectsView, () => 'grid')
}
