import { useSyncExternalStore } from 'react'
import {
  canBootstrapAgainstControlPlane,
  controlPlaneKindForOrigin,
  isRemoteCookieClient,
  readControlPlaneClientEnv,
  readEnvControlPlaneOrigin,
} from '@/lib/control-plane'

export type ControlPlaneKind = 'ha' | 'self-hosted'

export type ControlPlaneAccount = Readonly<{
  origin: string
  kind: ControlPlaneKind
  email: string | null
  runtime: 'deno' | 'workers' | null
  lastOrgId: string | null
}>

export type ControlPlaneStoreState = Readonly<{
  accounts: readonly ControlPlaneAccount[]
  activeOrigin: string | null
}>

export type ControlPlaneStorage = {
  read(): Promise<string | null>
  write(value: string): Promise<void>
}

const STORAGE_KEY = 'turbopanel.controlPlaneAccounts.v1'

const emptyState: ControlPlaneStoreState = {
  accounts: [],
  activeOrigin: null,
}

let state: ControlPlaneStoreState = emptyState
let hydrated = false
const listeners = new Set<() => void>()
let storageOverride: ControlPlaneStorage | null = null

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function persist(): void {
  if (!isRemoteCookieClient()) return
  const payload = JSON.stringify(state)
  void resolveStorage()
    .then((storage) => storage.write(payload))
    .catch(() => {
      // Persistence is best-effort; in-memory state remains authoritative.
    })
}

function withOriginLast(
  accounts: readonly ControlPlaneAccount[],
  origin: string,
  replacement?: ControlPlaneAccount,
): ControlPlaneAccount[] {
  const others = accounts.filter((account) => account.origin !== origin)
  const kept = replacement ?? accounts.find((account) => account.origin === origin)
  return kept ? [...others, kept] : [...others]
}

function setState(next: ControlPlaneStoreState): void {
  state = {
    accounts: next.accounts,
    activeOrigin: next.activeOrigin,
  }
  emit()
  persist()
}

export function subscribeControlPlaneStore(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getControlPlaneStoreSnapshot(): ControlPlaneStoreState {
  return state
}

export function getActiveControlPlaneOrigin(): string | null {
  return state.activeOrigin
}

export function canQueryControlPlane(): boolean {
  return canBootstrapAgainstControlPlane(
    readControlPlaneClientEnv(),
    getActiveControlPlaneOrigin(),
  )
}

export function getActiveControlPlaneAccount(): ControlPlaneAccount | null {
  if (!state.activeOrigin) return null
  return state.accounts.find((account) => account.origin === state.activeOrigin) ?? null
}

export function getControlPlaneAccounts(): readonly ControlPlaneAccount[] {
  return state.accounts
}

export function useControlPlaneStore(): ControlPlaneStoreState {
  return useSyncExternalStore(
    subscribeControlPlaneStore,
    getControlPlaneStoreSnapshot,
    getControlPlaneStoreSnapshot,
  )
}

export function isControlPlaneStoreHydrated(): boolean {
  return hydrated
}

function parseStoredAccount(entry: unknown): ControlPlaneAccount | null {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    return null
  }
  const row = entry as {
    origin?: unknown
    kind?: unknown
    email?: unknown
    runtime?: unknown
    lastOrgId?: unknown
  }
  if (typeof row.origin !== 'string' || row.origin.length === 0) return null
  const kind = row.kind === 'ha' || row.kind === 'self-hosted'
    ? row.kind
    : controlPlaneKindForOrigin(row.origin)
  return {
    origin: row.origin,
    kind,
    email: typeof row.email === 'string' ? row.email : null,
    runtime: row.runtime === 'deno' || row.runtime === 'workers'
      ? row.runtime
      : null,
    lastOrgId: typeof row.lastOrgId === 'string' ? row.lastOrgId : null,
  }
}

function parseStoredState(raw: string | null): ControlPlaneStoreState | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const record = parsed as {
    accounts?: unknown
    activeOrigin?: unknown
  }
  if (!Array.isArray(record.accounts)) return null
  const accounts = record.accounts
    .map((entry) => parseStoredAccount(entry))
    .filter((account): account is ControlPlaneAccount => account !== null)
  const activeOrigin =
    typeof record.activeOrigin === 'string' &&
    accounts.some((account) => account.origin === record.activeOrigin)
      ? record.activeOrigin
      : accounts[0]?.origin ?? null
  return { accounts, activeOrigin }
}

async function resolveStorage(): Promise<ControlPlaneStorage> {
  if (storageOverride) return storageOverride
  if (readControlPlaneClientEnv().platformOS === 'web') {
    return memoryStorage
  }
  try {
    const SecureStore = await import('expo-secure-store')
    return {
      read: () => SecureStore.getItemAsync(STORAGE_KEY),
      write: (value) => SecureStore.setItemAsync(STORAGE_KEY, value),
    }
  } catch {
    return memoryStorage
  }
}

const memoryBag: { value: string | null } = { value: null }

const memoryStorage: ControlPlaneStorage = {
  read: async () => memoryBag.value,
  write: async (value) => {
    memoryBag.value = value
  },
}

export function configureControlPlaneStorageForTests(
  storage: ControlPlaneStorage | null,
): void {
  storageOverride = storage
}

export function resetControlPlaneStoreForTests(
  next: ControlPlaneStoreState = emptyState,
  options?: Readonly<{ hydrated?: boolean }>,
): void {
  state = {
    accounts: [...next.accounts],
    activeOrigin: next.activeOrigin,
  }
  hydrated = options?.hydrated ?? true
  memoryBag.value = null
  emit()
}

function applyEnvPrefill(current: ControlPlaneStoreState): ControlPlaneStoreState {
  if (current.activeOrigin) return current
  const envOrigin = readEnvControlPlaneOrigin()
  if (!envOrigin) return current
  if (current.accounts.some((account) => account.origin === envOrigin)) {
    return { accounts: current.accounts, activeOrigin: envOrigin }
  }
  return {
    accounts: [
      ...current.accounts,
      {
        origin: envOrigin,
        kind: controlPlaneKindForOrigin(envOrigin),
        email: null,
        runtime: null,
        lastOrgId: null,
      },
    ],
    activeOrigin: envOrigin,
  }
}

export async function hydrateControlPlaneStore(): Promise<void> {
  if (hydrated) return
  if (!isRemoteCookieClient()) {
    hydrated = true
    return
  }
  const storage = await resolveStorage()
  const stored = parseStoredState(await storage.read())
  const next = applyEnvPrefill(stored ?? emptyState)
  state = {
    accounts: [...next.accounts],
    activeOrigin: next.activeOrigin,
  }
  hydrated = true
  emit()
  persist()
}

export function activateControlPlaneOrigin(origin: string): ControlPlaneAccount {
  const existing = state.accounts.find((account) => account.origin === origin)
  if (existing) {
    setState({
      accounts: withOriginLast(state.accounts, origin),
      activeOrigin: origin,
    })
    return existing
  }
  const created: ControlPlaneAccount = {
    origin,
    kind: controlPlaneKindForOrigin(origin),
    email: null,
    runtime: null,
    lastOrgId: null,
  }
  setState({
    accounts: [...state.accounts, created],
    activeOrigin: origin,
  })
  return created
}

export function rememberSignedInAccount(input: Readonly<{
  email?: string | null
  runtime?: 'deno' | 'workers' | null
  lastOrgId?: string | null
}>): void {
  const origin = state.activeOrigin
  if (!origin) return
  const current = state.accounts.find((account) => account.origin === origin)
  const next: ControlPlaneAccount = {
    origin,
    kind: current?.kind ?? controlPlaneKindForOrigin(origin),
    email: input.email ?? current?.email ?? null,
    runtime: input.runtime ?? current?.runtime ?? null,
    lastOrgId: input.lastOrgId ?? current?.lastOrgId ?? null,
  }
  setState({
    accounts: withOriginLast(state.accounts, origin, next),
    activeOrigin: origin,
  })
}

export function switchControlPlaneAccount(origin: string): boolean {
  if (!state.accounts.some((account) => account.origin === origin)) {
    return false
  }
  setState({
    accounts: withOriginLast(state.accounts, origin),
    activeOrigin: origin,
  })
  return true
}

/**
 * Drops an origin (failed connect) and optionally restores another.
 */
export function discardControlPlaneOrigin(
  origin: string,
  restoreOrigin: string | null = null,
): void {
  const remaining = state.accounts.filter((account) => account.origin !== origin)
  let nextActive = state.activeOrigin
  if (restoreOrigin && remaining.some((account) => account.origin === restoreOrigin)) {
    nextActive = restoreOrigin
  } else if (state.activeOrigin === origin) {
    nextActive = remaining.at(-1)?.origin ?? null
  }
  setState({
    accounts: remaining,
    activeOrigin: nextActive,
  })
}

/**
 * Drops the active origin. Returns the next account to activate, if any.
 */
export function removeActiveControlPlaneAccount(): ControlPlaneAccount | null {
  const active = state.activeOrigin
  if (!active) return null
  const remaining = state.accounts.filter((account) => account.origin !== active)
  const next = remaining.at(-1) ?? null
  setState({
    accounts: remaining,
    activeOrigin: next?.origin ?? null,
  })
  return next
}
