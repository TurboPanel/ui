import type {
  DirectoryNameKind,
  DirectoryNamesMode,
  EnvironmentFolderRecord,
  FolderState,
} from '@/lib/instance-api'

/** One folder name under a site owner: lowercase letters, digits, dots, hyphens, underscores; 63 at most. */
const FOLDER_NAME_RULE = /^[a-z0-9]([a-z0-9._-]{0,61}[a-z0-9])?$/

export const FOLDER_NAME_RULE_TEXT =
  'Lowercase letters, digits, dots, hyphens and underscores. Start and end with a letter or digit, and no “..”. Up to 63 characters.'

export const DIRECTORY_NAMES_LABELS: Record<DirectoryNamesMode, string> = {
  slug: 'Readable names',
  uuid: 'Ids',
  both: 'Choose for each',
}

export const DIRECTORY_NAMES_OPTIONS: readonly {
  value: DirectoryNamesMode
  label: string
  detail: string
}[] = [
  { value: 'slug', label: DIRECTORY_NAMES_LABELS.slug, detail: 'Example: example.com' },
  { value: 'uuid', label: DIRECTORY_NAMES_LABELS.uuid, detail: 'Example: 3f2b8c1e-…' },
  {
    value: 'both',
    label: DIRECTORY_NAMES_LABELS.both,
    detail: 'Each service or volume picks a readable name or its id',
  },
]

export function isDirectoryNamesMode(value: unknown): value is DirectoryNamesMode {
  return value === 'slug' || value === 'uuid' || value === 'both'
}

/** A readable folder name made from a display name; empty when nothing usable is left. */
export function suggestFolderName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, '-')
    .replaceAll(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
  return cleaned.slice(0, 63).replaceAll(/[^a-z0-9]+$/g, '')
}

/** What is wrong with a typed folder name, or null when it is fine (or empty: the panel picks one). */
export function folderNameProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (trimmed.includes('..')) return FOLDER_NAME_RULE_TEXT
  return FOLDER_NAME_RULE.test(trimmed) ? null : FOLDER_NAME_RULE_TEXT
}

const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Which kind of name a saved folder name is: an id, or a readable name. */
export function folderNameKindOf(slug: string | null | undefined): DirectoryNameKind {
  return slug && UUID_NAME.test(slug) ? 'uuid' : 'slug'
}

export type FolderNameDraft = {
  /** Typed folder name; empty means "pick one for me". */
  name: string
  /** Only used when the organization lets each asset choose. */
  kind: DirectoryNameKind
  /** Shared across environments. */
  common: boolean
}

export const EMPTY_FOLDER_DRAFT: FolderNameDraft = { name: '', kind: 'slug', common: false }

/** The folder fields a create or patch body should carry for this draft under the organization's mode. */
export function folderBodyFields(
  draft: FolderNameDraft,
  mode: DirectoryNamesMode
): { slug?: string; directoryName?: DirectoryNameKind; common?: boolean } {
  const out: { slug?: string; directoryName?: DirectoryNameKind; common?: boolean } = {}
  const typed = draft.name.trim()
  if (mode === 'both') out.directoryName = draft.kind
  if (typed !== '' && mode !== 'uuid' && (mode !== 'both' || draft.kind === 'slug')) {
    out.slug = typed
  }
  if (draft.common) out.common = true
  return out
}

const FOLDER_STATE_LABELS: Record<FolderState, string> = {
  planned: 'Planned',
  present: 'On the server',
  removing: 'Being removed',
  orphan: 'Not in TurboPanel',
  missing: 'Missing',
}

export function folderStateLabel(state: FolderState): string {
  return FOLDER_STATE_LABELS[state]
}

/** One plain line for a folder row: what it is, where, and why it is still there. */
export function folderLine(folder: EnvironmentFolderRecord): string {
  const what = folder.assetName ?? folder.slug
  const kind = folder.kind === 'service' ? 'service' : 'volume'
  const where = folder.serverName ? ` on server ${folder.serverName}` : ''
  return `${what} (${kind}${where})`
}

/** The sentence under the folder list when it blocks a rename, move or delete. */
export function folderLockExplanation(total: number): string | null {
  if (total <= 0) return null
  return "This environment's name is part of the folder path on your servers, so it cannot change, move to another server or be deleted while these folders exist. Remove the services and volumes first, or put assets that should not depend on the name in the shared folder."
}

/** Plain words for where a service's folder is: its name and which folder it sits in. */
export function serviceFolderWhere(slug: string, common: boolean): string {
  return common
    ? `${slug}, in the site owner's shared folder`
    : `${slug}, in the folder named after its environment`
}
