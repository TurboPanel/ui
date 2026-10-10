import type {
  DeployPreviewNativeAppVariable,
  DeployPreviewServer,
  NativeAppVariableReason,
} from '@/lib/instance-api'

/**
 * Per-host Prepared YAML. Empty when a single compiled snapshot already
 * covers the plan — showing `servers[]` then would duplicate compose.yaml.
 */
export function preparedPerServerCompose(
  servers: readonly DeployPreviewServer[] | undefined,
): readonly DeployPreviewServer[] {
  if (!servers || servers.length <= 1) return []
  return servers
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  organization: 'organization variable',
  workspace: 'workspace variable',
  project: 'project variable',
  environment: 'environment variable',
  service: 'service variable',
  hosting: 'hostname variable',
  server: 'server variable',
  binding: 'managed database',
  platform: 'set by TurboPanel',
}

const REASON_LABELS: Readonly<Record<NativeAppVariableReason, string>> = {
  not_referenced: 'not passed: it was set above this app, so the app has to ask for it',
  platform: 'not passed: TurboPanel sets this one itself',
  invalid_name: 'not passed: not a valid variable name',
  invalid_value: 'not passed: the value is too long or holds a null character',
  too_many: 'not passed: an app can take at most 256 variables',
}

/** Where a Node app's variable was set, in plain words. */
export function nativeAppVariableSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? 'unknown source'
}

/**
 * One line of a Node app's variable list: `NAME = value (where it was set)`.
 * A secret shows as hidden, never its value; a name that does not reach the
 * process says why.
 */
export function nativeAppVariableLine(entry: DeployPreviewNativeAppVariable): string {
  const shown = entry.isSecret || entry.value === null ? 'hidden (secret)' : entry.value
  const where = nativeAppVariableSourceLabel(entry.source)
  const note = !entry.delivered && entry.reason ? `; ${REASON_LABELS[entry.reason]}` : ''
  const hint =
    entry.reason === 'not_referenced' ? ` (to pass it, add {$${entry.name}} to the app's environment)` : ''
  return `${entry.name} = ${shown} (${where}${note})${hint}`
}
