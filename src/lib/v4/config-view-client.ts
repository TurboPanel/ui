/**
 * Typed client for `GET /api/client/v1/environments/:id/config-view` (control
 * plane: `features/compose/config-view.ts`).
 *
 * The answer is derived on the server, so the ui never re-implements the
 * compose merge: what the Base says, what the environment really runs, and
 * what the environment changes. Secrets carry no value (`masked`).
 *
 * Kept in its own file and small on purpose; the types mirror the response
 * one to one. The route needs organization manage access (403 otherwise) and
 * answers 422 `compose_invalid` when a saved compose cannot be read, so every
 * screen has to cope with the call failing.
 */

import { apiFetch } from '@/lib/instance-api'

const CLIENT_API = '/api/client/v1'

export type ConfigViewSource = 'base' | 'project' | 'environment'
export type ConfigViewArea = 'service' | 'domain' | 'linuxUser' | 'variable'
export type ConfigViewServiceKind = 'container' | 'site' | 'node'
export type ConfigViewLinuxUserAccess = 'none' | 'sftp' | 'ssh'

export type ConfigViewFieldRow = Readonly<{
  /** Stable id, e.g. `svc:web:command`. */
  key: string
  area: 'service' | 'domain' | 'linuxUser'
  /** The field inside the service: `image`, `command`, `linuxUser`, `depends_on`. */
  field: string
  label: string
  /** Display text; `null` when `masked`. */
  value: string | null
  masked: boolean
  source: ConfigViewSource
}>

export type ConfigViewService = Readonly<{
  /** The compose service name. */
  name: string
  /** This environment's service row; `null` when none is saved yet. */
  serviceId: string | null
  kind: ConfigViewServiceKind
  /** `environment` when added here, or when the environment stands alone. */
  source: ConfigViewSource
  rows: readonly ConfigViewFieldRow[]
}>

export type ConfigViewLinuxUser = Readonly<{
  name: string
  access: ConfigViewLinuxUserAccess
  description: string | null
  source: ConfigViewSource
  /** Service names that run as this user. */
  usedBy: readonly string[]
}>

export type ConfigViewVariable = Readonly<{
  /** `var:NAME`. */
  key: string
  name: string
  variableId: string
  /** `null` when secret. */
  value: string | null
  isSecret: boolean
  forBuild: boolean
  forRuntime: boolean
  source: 'project' | 'environment'
}>

export type ConfigViewChange = Readonly<{
  /** `svc:<service>`, `svc:<service>:<field>`, `user:<name>` or `var:NAME`. */
  key: string
  area: ConfigViewArea
  label: string
  field: string | null
  serviceName: string | null
  serviceId: string | null
  kind: 'added' | 'changed' | 'removed'
  /** `null` when the Base has nothing, or when masked. */
  baseValue: string | null
  baseSource: 'base' | 'project' | null
  /** `null` when this environment has nothing, or when masked. */
  envValue: string | null
  envSource: 'environment' | null
  masked: boolean
}>

export type ConfigViewSide = Readonly<{
  services: readonly ConfigViewService[]
  variables: readonly ConfigViewVariable[]
  linuxUsers: readonly ConfigViewLinuxUser[]
}>

export type EnvironmentConfigView = Readonly<{
  ok: true
  environmentId: string
  projectId: string
  /** Derived from the saved compose, never stored. */
  followsBase: boolean
  base: ConfigViewSide
  effective: ConfigViewSide
  changes: readonly ConfigViewChange[]
}>

export async function fetchConfigView(environmentId: string): Promise<EnvironmentConfigView> {
  return await apiFetch(`${CLIENT_API}/environments/${encodeURIComponent(environmentId)}/config-view`)
}
