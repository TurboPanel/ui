import type { PostDeployTiming, ServiceOptions, SiteWorkerOption } from '@/lib/instance-api'

/** Limits the control plane enforces; the same numbers, so the form can say them. */
export const MAX_POST_DEPLOY_COMMANDS = 10
export const DEFAULT_POST_DEPLOY_TIMEOUT_SECONDS = 900
export const MAX_SITE_WORKERS = 10
export const DEFAULT_WORKER_PROCESSES = 1
export const DEFAULT_WORKER_STOP_TIMEOUT_SECONDS = 90

export const POST_DEPLOY_SHARED_HELP =
  "Run in the new release as the site's account, with the site's variables. Not run on a rollback. A retried deploy can run them again, so make them safe to run more than once."

export const POST_DEPLOY_TIMING_HELP: Record<PostDeployTiming, string> = {
  'before-traffic': 'A failing command stops the deploy and the current release keeps serving.',
  'after-switch':
    'A failing command marks the deploy failed while the new release keeps serving. Roll back from the deploy history if needed.',
}

export const WORKERS_HELP =
  'Restarted after every deploy. Set the stop timeout above your longest job.'

export type WorkerRow = {
  /** Local key for the list; not sent. */
  key: string
  name: string
  command: string
  processes: string
  stopTimeoutSeconds: string
  memoryMb: string
  enabled: boolean
}

export type PhpLifecycleForm = {
  commands: string
  timeoutSeconds: string
  timing: PostDeployTiming
  workers: WorkerRow[]
}

export function emptyWorkerRow(key: string): WorkerRow {
  return {
    key,
    name: '',
    command: '',
    processes: '',
    stopTimeoutSeconds: '',
    memoryMb: '',
    enabled: true,
  }
}

function text(value: number | undefined): string {
  return value === undefined ? '' : String(value)
}

/** The form as the stored options read. */
export function lifecycleFormFrom(options: ServiceOptions): PhpLifecycleForm {
  return {
    commands: (options.postDeployCommands ?? []).join('\n'),
    timeoutSeconds: text(options.postDeployTimeoutSeconds),
    timing: options.postDeployTiming ?? 'before-traffic',
    workers: (options.workers ?? []).map((worker, index) => ({
      key: `stored-${index}`,
      name: worker.name,
      command: worker.command,
      processes: text(worker.processes),
      stopTimeoutSeconds: text(worker.stopTimeoutSeconds),
      memoryMb: text(worker.memoryMb),
      enabled: worker.enabled !== false,
    })),
  }
}

/** One command per line; blank lines dropped. */
export function commandLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

type Whole = { ok: true; value: number | undefined } | { ok: false }

function wholeNumber(value: string): Whole {
  const trimmed = value.trim()
  if (trimmed === '') return { ok: true, value: undefined }
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  return { ok: true, value: Number(trimmed) }
}

const WORKER_NUMBER_FIELDS = [
  ['processes', 'process count'],
  ['stopTimeoutSeconds', 'stop time limit'],
  ['memoryMb', 'memory limit in megabytes'],
] as const

function workerFrom(row: WorkerRow): { worker: SiteWorkerOption } | { error: string } {
  const name = row.name.trim()
  const worker: SiteWorkerOption = { name, command: row.command.trim() }
  for (const [field, label] of WORKER_NUMBER_FIELDS) {
    const parsed = wholeNumber(row[field])
    if (!parsed.ok) {
      const who = name === '' ? 'A new worker' : `Worker "${name}"`
      return { error: `${who}: the ${label} must be a whole number.` }
    }
    if (parsed.value !== undefined) worker[field] = parsed.value
  }
  if (!row.enabled) worker.enabled = false
  return { worker }
}

export type LifecycleFields = Pick<
  ServiceOptions,
  'postDeployCommands' | 'postDeployTimeoutSeconds' | 'postDeployTiming' | 'workers'
>

/**
 * The option fields for the form. Only what is set is returned, so a cleared
 * field leaves the stored one out. A value that is not a whole number is
 * refused here; a value out of range goes to the control plane, whose sentence
 * is shown as it is.
 */
export function lifecycleFieldsFrom(
  form: PhpLifecycleForm
): { fields: LifecycleFields } | { error: string } {
  const fields: LifecycleFields = {}
  const commands = commandLines(form.commands)
  if (commands.length > 0) fields.postDeployCommands = commands
  const timeout = wholeNumber(form.timeoutSeconds)
  if (!timeout.ok) return { error: 'The post-deploy time limit must be a whole number of seconds.' }
  if (timeout.value !== undefined) fields.postDeployTimeoutSeconds = timeout.value
  if (form.timing !== 'before-traffic') fields.postDeployTiming = form.timing
  const workers: SiteWorkerOption[] = []
  for (const row of form.workers) {
    const built = workerFrom(row)
    if ('error' in built) return built
    workers.push(built.worker)
  }
  if (workers.length > 0) fields.workers = workers
  return { fields }
}

/** The stored lifecycle fields, to carry through a save while the section is hidden. */
export function storedLifecycleFields(options: ServiceOptions): LifecycleFields {
  const fields: LifecycleFields = {}
  if (options.postDeployCommands) fields.postDeployCommands = options.postDeployCommands
  if (options.postDeployTimeoutSeconds !== undefined) {
    fields.postDeployTimeoutSeconds = options.postDeployTimeoutSeconds
  }
  if (options.postDeployTiming) fields.postDeployTiming = options.postDeployTiming
  if (options.workers) fields.workers = options.workers
  return fields
}

/** What a save carries: the form's fields for a site, the stored ones for any other service. */
export function lifecycleSaveFields(
  isSite: boolean,
  form: PhpLifecycleForm,
  stored: ServiceOptions
): { fields: LifecycleFields } | { error: string } {
  return isSite ? lifecycleFieldsFrom(form) : { fields: storedLifecycleFields(stored) }
}
