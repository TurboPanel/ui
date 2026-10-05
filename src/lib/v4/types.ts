/**
 * Shared shapes for the v4 project editor logic (Base + changes per
 * environment, Linux users, the environment map).
 *
 * Everything in `src/lib/v4/` is framework-free: plain data in, plain data
 * out, no storage, no network, no React. Screens fetch the data (project and
 * environment compose, principals, services, hostings, storage) and hand it in.
 *
 * ## Flat configuration
 *
 * The screens talk about "what a setting is", not about compose paths. A
 * configuration is therefore a flat map from a stable key to a display
 * value:
 *
 * - `svc:{serviceId}:{row}`: one setting of one app (`start`, `build`,
 *   `runsAs`, ...)
 * - `var:{NAME}`: one variable
 *
 * Turning compose documents into this map is the config-view endpoint's job
 * (it keeps the compose merge rules in one place, on the server). This module
 * only compares and labels flat maps.
 */

import type { ComposeServiceKind } from '@/lib/compose/service-kind'

/** `key -> display value`. Insertion order is display order. */
export type FlatConfig = Readonly<Record<string, string>>

/** One key an environment sets itself; `value: null` means it removes the key. */
export type ConfigChange = Readonly<{ key: string; value: string | null }>

/**
 * Where an environment's configuration comes from.
 *
 * - follows the Base: the Base plus a list of changes
 * - stands alone: its own complete set of values; Base edits do not reach it
 */
export type EnvConfigSource =
  | Readonly<{ standsAlone: false; changes: readonly ConfigChange[] }>
  | Readonly<{ standsAlone: true; values: FlatConfig }>

/** An app or data service as the v4 screens see it. */
export type V4Service = Readonly<{
  id: string
  name: string
  /** `database` is a managed database (not part of the compose file). */
  kind: ComposeServiceKind | 'database'
  /** Container image, when the kind is `container`. */
  image?: string
  /** Engine or runtime text for data stores ("PostgreSQL 17"). */
  engine?: string
  /** This service answers the environment's web domains. */
  web?: boolean
  /** Number of scheduled jobs. */
  jobCount?: number
}>

/** Where a configuration value comes from, for the source tag on a row. */
export type ConfigSource = 'base' | 'env' | 'own'

/** Area a change belongs to, for grouping in the Configuration lists. */
export type ConfigArea = 'service' | 'services' | 'variables' | 'users' | 'settings'

/**
 * One difference between an environment and the Base.
 * Field names follow the config-view `changes` entries.
 */
export type ConfigChangeRow = Readonly<{
  key: string
  area: ConfigArea
  label: string
  /** Lower-case form for use inside a sentence ("start command"). */
  short: string
  serviceId: string | null
  serviceName: string
  baseValue: string
  envValue: string
  /** The Base has no value for this key. */
  added: boolean
  /** The environment has no value for this key. */
  removed: boolean
  envName: string
  /** The tag shown on the row: "Staging change". */
  tag: string
}>
