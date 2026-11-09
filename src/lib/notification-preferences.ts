import { isHttpStatusError } from '@/lib/fetch-error-detail'
import type {
  NotificationEffectiveLevel,
  NotificationEffectiveLevels,
  NotificationLevel,
  NotificationPreferenceKind,
  NotificationPreferenceRow,
  NotificationPreferenceScope,
  NotificationPreferenceSource,
  NotificationPreferences,
  NotificationPresetId,
  NotificationUnsubscribeResult,
  SettableNotificationKind,
} from '@/lib/instance-api'

/**
 * The pure half of the notification settings screens: level and kind words,
 * "effective from" labels, which quick preset a scope matches, the override
 * list, and the same most-specific-row rule the control plane resolves with,
 * so a screen never shows a level the control plane would not apply. Nothing
 * arrives until a person turns something on, so the words here say so plainly.
 */

export const LEVEL_OPTIONS: readonly { value: NotificationLevel; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'warning', label: 'Warnings and Critical' },
  { value: 'critical', label: 'Critical Only' },
  { value: 'none', label: 'Off' },
]

export const LEVEL_LABEL: Record<NotificationLevel, string> = {
  all: 'All',
  warning: 'Warnings and Critical',
  critical: 'Critical Only',
  none: 'Off',
}

export const PREFERENCE_KIND_LABEL: Record<SettableNotificationKind, string> = {
  inbox: 'Bell',
  email: 'Email',
  chat: 'Chat',
  webhook: 'Webhook',
}

/** Scope words, as a heading or a label names them. */
export const SCOPE_WORD: Record<NotificationPreferenceSource, string> = {
  default: 'Nothing Set',
  global: 'Every Organization',
  organization: 'Organization',
  project: 'Project',
  environment: 'Environment',
  server: 'Server',
  service: 'Service',
  destination: 'Backup Target',
}

export const PRESET_OPTIONS: readonly {
  id: NotificationPresetId
  label: string
  description: string
}[] = [
  { id: 'everything', label: 'Everything', description: 'Every event in the bell and by email.' },
  {
    id: 'recommended',
    label: 'Recommended',
    description: 'Every event in the bell; warnings and critical by email.',
  },
  {
    id: 'critical',
    label: 'Critical Only',
    description: 'Only critical events, in the bell and by email.',
  },
  { id: 'nothing', label: 'Nothing', description: 'Nothing in the bell or by email.' },
]

/** The preference kind a personal channel counts as: Slack, Discord and Telegram are all chat. */
export function channelPreferenceKind(kind: string): SettableNotificationKind | null {
  if (kind === 'email') return 'email'
  if (kind === 'webhook') return 'webhook'
  if (kind === 'slack' || kind === 'discord' || kind === 'telegram') return 'chat'
  return null
}

/** Bell and Email always; Chat and Webhook only when the person has such a channel. */
export function availableKinds(channels: readonly { kind: string }[]): SettableNotificationKind[] {
  const kinds: SettableNotificationKind[] = ['inbox', 'email']
  const present = new Set(channels.map((c) => channelPreferenceKind(c.kind)))
  if (present.has('chat')) kinds.push('chat')
  if (present.has('webhook')) kinds.push('webhook')
  return kinds
}

/** The scope a settings card stands at, as the source word the API answers with. */
export function scopeSource(scope: NotificationPreferenceScope): NotificationPreferenceSource {
  if (scope.serviceId) return 'service'
  if (scope.serverId) return 'server'
  if (scope.destinationId) return 'destination'
  if (scope.environmentId) return 'environment'
  if (scope.projectId) return 'project'
  if (scope.organizationId) return 'organization'
  return 'global'
}

/**
 * The line under a level picker: "Set here", "Effective from Organization",
 * or, when no row decides, that nothing is turned on.
 */
export function effectiveFromLabel(
  effective: Pick<NotificationEffectiveLevel, 'source'>,
  here: NotificationPreferenceSource
): string {
  if (effective.source === 'default') return 'Off until you turn it on'
  if (effective.source === here) return 'Set here'
  return `Effective from ${SCOPE_WORD[effective.source]}`
}

function same(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

/** The scope ids a row names. */
export function rowScope(row: NotificationPreferenceRow): NotificationPreferenceScope {
  return {
    organizationId: row.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    serviceId: row.serviceId,
    serverId: row.serverId,
    destinationId: row.destinationId,
  }
}

/** True when the row stands at exactly this scope (every id equal, missing = null). */
export function rowIsAtScope(
  row: NotificationPreferenceRow,
  scope: NotificationPreferenceScope
): boolean {
  return (
    same(row.organizationId, scope.organizationId) &&
    same(row.projectId, scope.projectId) &&
    same(row.environmentId, scope.environmentId) &&
    same(row.serviceId, scope.serviceId) &&
    same(row.serverId, scope.serverId) &&
    same(row.destinationId, scope.destinationId)
  )
}

/** The row that sets one kind for every topic at exactly this scope, if any. */
export function kindRowAt(
  rows: readonly NotificationPreferenceRow[],
  scope: NotificationPreferenceScope,
  kind: SettableNotificationKind
): NotificationPreferenceRow | undefined {
  return rows.find(
    (r) =>
      rowIsAtScope(r, scope) &&
      r.kind === kind &&
      r.channelId === null &&
      r.categoryCode === null &&
      r.topicCode === null
  )
}

/** The row that sets one category for every kind at exactly this scope, if any. */
export function categoryRowAt(
  rows: readonly NotificationPreferenceRow[],
  scope: NotificationPreferenceScope,
  categoryCode: string
): NotificationPreferenceRow | undefined {
  return rows.find(
    (r) =>
      rowIsAtScope(r, scope) &&
      r.categoryCode === categoryCode &&
      r.kind === null &&
      r.channelId === null &&
      r.topicCode === null
  )
}

/**
 * The quick preset the bell and email rows at this scope match, or null when
 * either is unset or they match none (a mix the person chose by hand).
 */
export function activePreset(
  rows: readonly NotificationPreferenceRow[],
  presets: NotificationPreferences['presets'] | undefined,
  scope: NotificationPreferenceScope
): NotificationPresetId | null {
  if (!presets) return null
  const inbox = kindRowAt(rows, scope, 'inbox')
  const email = kindRowAt(rows, scope, 'email')
  if (!inbox || !email) return null
  const match = PRESET_OPTIONS.find(
    ({ id }) => presets[id].inbox === inbox.level && presets[id].email === email.level
  )
  return match?.id ?? null
}

/**
 * What a row sets, as the screens sort it: `kind` is a level for one channel
 * kind and every event (the level pickers); `category` is one category for
 * every channel (the Categories picker); `category-target` is one category
 * for one channel kind or one personal channel (what an email unsubscribe
 * writes); `other` is anything else the API accepts (one event, one channel
 * for every event, every kind at once, phone push).
 */
export type PreferenceRowShape = 'kind' | 'category' | 'category-target' | 'other'

export function rowShape(row: NotificationPreferenceRow): PreferenceRowShape {
  if (row.topicCode !== null || row.kind === 'push') return 'other'
  if (row.categoryCode === null) {
    return row.kind !== null && row.channelId === null ? 'kind' : 'other'
  }
  return row.kind === null && row.channelId === null ? 'category' : 'category-target'
}

/** True when a row's end time has passed: the control plane ignores it. */
export function rowHasEnded(
  row: Pick<NotificationPreferenceRow, 'endsAt'>,
  nowMs: number
): boolean {
  return row.endsAt !== null && Date.parse(row.endsAt) <= nowMs
}

function scopeRank(row: NotificationPreferenceRow): number {
  if (row.serviceId || row.serverId || row.destinationId) return 5
  if (row.environmentId) return 4
  if (row.projectId) return 3
  if (row.organizationId) return 2
  return 1
}

function subjectRank(row: NotificationPreferenceRow): number {
  if (row.topicCode) return 3
  if (row.categoryCode) return 2
  return 1
}

function targetRank(row: NotificationPreferenceRow): number {
  if (row.channelId) return 3
  if (row.kind) return 2
  return 1
}

const SCOPE_ID_KEYS = [
  'organizationId',
  'projectId',
  'environmentId',
  'serviceId',
  'serverId',
  'destinationId',
] as const

/** Where something happened and what it was, as far as preferences are concerned. */
export type PreferenceEvent = NotificationPreferenceScope & {
  topicCode?: string | null
  categoryCode?: string | null
}

/** The copy being decided: a channel kind, and the personal channel when there is one. */
export type PreferenceTarget = { kind: NotificationPreferenceKind; channelId?: string | null }

function allows(rowValue: string | null, value: string | null | undefined): boolean {
  return rowValue === null || rowValue === (value ?? null)
}

function rowApplies(
  row: NotificationPreferenceRow,
  event: PreferenceEvent,
  target: PreferenceTarget,
  nowMs: number
): boolean {
  if (rowHasEnded(row, nowMs)) return false
  if (!SCOPE_ID_KEYS.every((key) => allows(row[key], event[key]))) return false
  if (!allows(row.topicCode, event.topicCode) || !allows(row.categoryCode, event.categoryCode)) {
    return false
  }
  return allows(row.channelId, target.channelId) && allows(row.kind, target.kind)
}

/**
 * The row that decides one copy of one event, by the control plane's own rule
 * (its `resolveLevel`): the most specific row wins, compared by scope first
 * (a server, service or backup target, then environment, project,
 * organization, every organization), then subject (one event, one category,
 * every event), then target (one channel, one channel kind, every kind). A
 * row whose end time has passed is ignored; no row means Off. Keep the three
 * ranks in step with the control plane, or a screen shows a level it will not
 * apply.
 */
export function resolvePreferenceLevel(
  rows: readonly NotificationPreferenceRow[],
  event: PreferenceEvent,
  target: PreferenceTarget,
  nowMs: number
): { level: NotificationLevel; row: NotificationPreferenceRow | null } {
  let best: NotificationPreferenceRow | null = null
  let bestRank = -1
  for (const row of rows) {
    if (!rowApplies(row, event, target, nowMs)) continue
    const rank = scopeRank(row) * 100 + subjectRank(row) * 10 + targetRank(row)
    if (rank > bestRank) {
      best = row
      bestRank = rank
    }
  }
  return best ? { level: best.level, row: best } : { level: 'none', row: null }
}

export type CategoryKindLevel = {
  kind: SettableNotificationKind
  /** What the control plane applies to this category's events for this kind in the organization. */
  level: NotificationLevel
  source: NotificationPreferenceSource
  /** True when that is not what the category picker (or, unset, the level above it) says. */
  differs: boolean
}

export type CategoryPicture = {
  code: string
  name: string
  /** The row the picker edits: this category, every channel. */
  own: NotificationPreferenceRow | undefined
  /** Rows here for this category and one channel kind or one channel: each wins over `own`. */
  targeted: NotificationPreferenceRow[]
  inEffect: CategoryKindLevel[]
  differs: boolean
}

/**
 * Each category on an organization's Notifications tab: the row its picker
 * edits, the rows that name the category together with a channel kind or one
 * channel (an email unsubscribe writes one), and the level in effect per kind.
 * The picker alone is wrong whenever one of those rows, or one set for every
 * organization, decides instead; `differs` says so.
 */
export function categoryPictures(
  input: Readonly<{
    rows: readonly NotificationPreferenceRow[]
    organizationId: string
    categories: readonly { code: string; name: string }[]
    kinds: readonly SettableNotificationKind[]
    effective: Partial<NotificationEffectiveLevels>
    nowMs: number
  }>
): CategoryPicture[] {
  const { rows, organizationId, categories, kinds, effective, nowMs } = input
  const scope = { organizationId }
  // As the control plane's effective read does: a row naming one event is an
  // override below the category, so it is not part of the category's level.
  const candidates = rows.filter((r) => r.topicCode === null)
  return categories.map((category) => {
    const here = rows.filter((r) => rowIsAtScope(r, scope) && r.categoryCode === category.code)
    const own = here.find((r) => rowShape(r) === 'category')
    const targeted = here
      .filter((r) => rowShape(r) === 'category-target')
      .sort((a, b) => targetRank(a) - targetRank(b) || a.id.localeCompare(b.id))
    const ownLevel = own && !rowHasEnded(own, nowMs) ? own.level : null
    const inEffect = kinds.map((kind): CategoryKindLevel => {
      const decided = resolvePreferenceLevel(
        candidates,
        { organizationId, categoryCode: category.code },
        { kind },
        nowMs
      )
      const shown = ownLevel ?? effective[kind]?.level ?? 'none'
      return {
        kind,
        level: decided.level,
        source: decided.row ? scopeSource(rowScope(decided.row)) : 'default',
        differs: decided.level !== shown,
      }
    })
    return {
      code: category.code,
      name: category.name,
      own,
      targeted,
      inEffect,
      differs: inEffect.some((k) => k.differs),
    }
  })
}

/** The levels in effect for a category, in words; a kind the picker gets wrong says where its level comes from. */
export function categoryInEffectWords(picture: Pick<CategoryPicture, 'inEffect'>): string {
  return picture.inEffect
    .map((k) => {
      const words = `${PREFERENCE_KIND_LABEL[k.kind]}: ${LEVEL_LABEL[k.level]}`
      return k.differs ? `${words} (${effectiveFromLabel(k, 'organization')})` : words
    })
    .join(' · ')
}

/**
 * The rows at exactly this scope that no control there shows: everything but
 * the level pickers' rows (for the kinds on screen) and, where the Categories
 * block is drawn (`categories`), the rows it lists. Drawn as a plain list with
 * Remove, so every row a person has at a scope on screen can be seen and
 * removed there.
 */
export function otherRowsAt(
  rows: readonly NotificationPreferenceRow[],
  scope: NotificationPreferenceScope,
  shown: Readonly<{
    kinds: readonly SettableNotificationKind[]
    categories?: readonly string[]
  }>
): NotificationPreferenceRow[] {
  return rows.filter((row) => {
    if (!rowIsAtScope(row, scope)) return false
    const shape = rowShape(row)
    if (shape === 'kind') return !shown.kinds.includes(row.kind as SettableNotificationKind)
    if (shape === 'other') return true
    return !(shown.categories ?? []).includes(row.categoryCode ?? '')
  })
}

/** True when no row decides any kind at this scope: the person has not chosen a level yet. */
export function noLevelsSet(
  effective: Partial<NotificationEffectiveLevels> | undefined,
  kinds: readonly SettableNotificationKind[]
): boolean {
  if (!effective) return false
  return kinds.every((kind) => (effective[kind]?.source ?? 'default') === 'default')
}

type PreferencePicture = Pick<NotificationPreferences, 'rows' | 'channels' | 'catalog'>

/**
 * True when at least one event could reach the person in this organization:
 * some event, channel kind (or personal channel) and scope the rows name
 * resolves to a level other than Off.
 */
export function somethingResolvesOn(
  data: PreferencePicture,
  organizationId: string,
  nowMs: number
): boolean {
  if (!data.rows.some((r) => r.level !== 'none' && !rowHasEnded(r, nowMs))) return false
  const scopes: NotificationPreferenceScope[] = [
    { organizationId },
    ...overrideScopes(data.rows, organizationId).map((s) => s.scope),
  ]
  const targets: PreferenceTarget[] = availableKinds(data.channels).map((kind) => ({ kind }))
  for (const channel of data.channels) {
    const kind = channelPreferenceKind(channel.kind)
    if (kind) targets.push({ kind, channelId: channel.id })
  }
  const subjects: Pick<PreferenceEvent, 'topicCode' | 'categoryCode'>[] =
    data.catalog.topics.length > 0
      ? data.catalog.topics.map((t) => ({ topicCode: t.code, categoryCode: t.categoryCode }))
      : [{}]
  return scopes.some((scope) =>
    subjects.some((subject) =>
      targets.some(
        (target) =>
          resolvePreferenceLevel(data.rows, { ...scope, ...subject }, target, nowMs).level !==
          'none'
      )
    )
  )
}

/**
 * True when the person has chosen nothing for this organization and nothing
 * reaches them from it: no level row decides any kind (so a deliberate Nothing
 * preset does not count) and no category, project, environment or server
 * setting turns anything on either.
 */
export function nothingTurnedOn(
  data: (PreferencePicture & Pick<NotificationPreferences, 'effective'>) | undefined,
  organizationId: string,
  nowMs: number
): boolean {
  if (!data) return false
  if (!noLevelsSet(data.effective, availableKinds(data.channels))) return false
  return !somethingResolvesOn(data, organizationId, nowMs)
}

/** A stable key for one scope (query keys, list keys). */
export function scopeKey(scope: NotificationPreferenceScope): string {
  return [
    scope.organizationId ?? '-',
    scope.projectId ?? '-',
    scope.environmentId ?? '-',
    scope.serviceId ?? '-',
    scope.serverId ?? '-',
    scope.destinationId ?? '-',
  ].join(':')
}

const SCOPE_DEPTH: Record<NotificationPreferenceSource, number> = {
  default: -1,
  global: 0,
  organization: 1,
  project: 2,
  environment: 3,
  server: 4,
  service: 4,
  destination: 4,
}

/**
 * The scopes below the organization that hold at least one row: each gets its
 * own card on the organization's Notifications tab. Ordered project,
 * environment, then resource.
 */
export function overrideScopes(
  rows: readonly NotificationPreferenceRow[],
  organizationId: string
): { key: string; source: NotificationPreferenceSource; scope: NotificationPreferenceScope }[] {
  const seen = new Map<
    string,
    { key: string; source: NotificationPreferenceSource; scope: NotificationPreferenceScope }
  >()
  for (const row of rows) {
    if (row.organizationId !== organizationId) continue
    const scope = rowScope(row)
    const source = scopeSource(scope)
    if (SCOPE_DEPTH[source] < 2) continue
    const key = scopeKey(scope)
    if (!seen.has(key)) seen.set(key, { key, source, scope })
  }
  return [...seen.values()].sort((a, b) => SCOPE_DEPTH[a.source] - SCOPE_DEPTH[b.source])
}

/** Names the override list can put beside a scope word; missing names fall back to the word. */
export type PreferenceNames = {
  organizations?: ReadonlyMap<string, string>
  projects?: ReadonlyMap<string, string>
  environments?: ReadonlyMap<string, string>
  servers?: ReadonlyMap<string, string>
  categories?: ReadonlyMap<string, string>
  topics?: ReadonlyMap<string, string>
  channels?: ReadonlyMap<string, string>
}

function named(word: string, id: string | null, names: ReadonlyMap<string, string> | undefined) {
  const name = id ? names?.get(id) : undefined
  return name ? `${word} ${name}` : word
}

/** Where a row applies, in words: "Project Checkout › Environment production". */
export function rowScopeWords(row: NotificationPreferenceRow, names: PreferenceNames = {}): string {
  if (row.organizationId === null) return SCOPE_WORD.global
  const parts: string[] = []
  if (row.projectId) parts.push(named('Project', row.projectId, names.projects))
  if (row.environmentId) parts.push(named('Environment', row.environmentId, names.environments))
  if (row.serverId) parts.push(named('Server', row.serverId, names.servers))
  if (row.serviceId) parts.push('Service')
  if (row.destinationId) parts.push(SCOPE_WORD.destination)
  if (parts.length === 0) return 'Whole Organization'
  return parts.join(' › ')
}

/** Where a row's copies go: one personal channel by name, one channel kind, or every channel. */
export function rowTargetWords(
  row: NotificationPreferenceRow,
  names: PreferenceNames = {}
): string {
  if (row.channelId) return names.channels?.get(row.channelId) ?? 'One Channel'
  if (row.kind === 'push') return 'Push'
  if (row.kind) return PREFERENCE_KIND_LABEL[row.kind]
  return 'Every Channel'
}

/** What a row is about and where it goes: "Servers · Email", "Everything · Every Channel". */
export function rowSubjectWords(
  row: NotificationPreferenceRow,
  names: PreferenceNames = {}
): string {
  let subject = 'Everything'
  if (row.categoryCode) subject = names.categories?.get(row.categoryCode) ?? row.categoryCode
  else if (row.topicCode) subject = names.topics?.get(row.topicCode) ?? row.topicCode
  return `${subject} · ${rowTargetWords(row, names)}`
}

/** One line for a closed override card: "Bell: All · Email: Off · Servers · Email: Off", or that it inherits. */
export function overrideSummary(
  own: readonly NotificationPreferenceRow[],
  names: PreferenceNames = {}
): string {
  if (own.length === 0) return 'Inherits the organization levels'
  const kindLevels: string[] = []
  const others: string[] = []
  for (const row of own) {
    if (rowShape(row) === 'kind') {
      kindLevels.push(
        `${PREFERENCE_KIND_LABEL[row.kind as SettableNotificationKind]}: ${LEVEL_LABEL[row.level]}`
      )
    } else {
      others.push(`${rowSubjectWords(row, names)}: ${LEVEL_LABEL[row.level]}`)
    }
  }
  const parts = [...kindLevels, ...others]
  if (parts.length <= 3) return parts.join(' · ')
  return `${parts.slice(0, 3).join(' · ')} · and ${parts.length - 3} more`
}

export type OverrideGroup = {
  /** `null` = the global rows (every organization). */
  organizationId: string | null
  title: string
  rows: NotificationPreferenceRow[]
}

/**
 * Every row the person has, across the reads (one per organization, each
 * repeating the rows for every organization, plus the read of those alone),
 * grouped: Every Organization first, then each organization by name; inside a
 * group the widest scope first.
 */
export function groupOverrides(
  reads: readonly (readonly NotificationPreferenceRow[])[],
  organizationNames: ReadonlyMap<string, string> = new Map()
): OverrideGroup[] {
  const byId = new Map<string, NotificationPreferenceRow>()
  for (const rows of reads) for (const row of rows) byId.set(row.id, row)
  const groups = new Map<string | null, NotificationPreferenceRow[]>()
  for (const row of byId.values()) {
    const list = groups.get(row.organizationId) ?? []
    list.push(row)
    groups.set(row.organizationId, list)
  }
  const depth = (r: NotificationPreferenceRow) => SCOPE_DEPTH[scopeSource(rowScope(r))]
  const out: OverrideGroup[] = []
  for (const [organizationId, rows] of groups) {
    rows.sort(
      (a, b) =>
        depth(a) - depth(b) ||
        subjectRank(a) - subjectRank(b) ||
        (a.kind ?? '').localeCompare(b.kind ?? '') ||
        a.id.localeCompare(b.id)
    )
    out.push({
      organizationId,
      title:
        organizationId === null
          ? SCOPE_WORD.global
          : (organizationNames.get(organizationId) ?? 'Organization'),
      rows,
    })
  }
  return out.sort((a, b) => {
    if (a.organizationId === null) return -1
    if (b.organizationId === null) return 1
    return a.title.localeCompare(b.title)
  })
}

/** The unread count as a badge or label shows it: the API caps at 100, so past 99 it is "99+". */
export function unreadBadgeLabel(count: number): string {
  if (count > 99) return '99+'
  return String(Math.max(0, Math.floor(count)))
}

const PREFERENCE_ERROR_COPY: Record<string, string> = {
  scope_not_in_organization:
    'That project, environment or server is not in this organization any more.',
  primary_channel: 'Your Account Email channel follows your sign-in address and cannot be removed.',
  personal_channel_uses_preferences:
    'Your own channels follow your notification settings, not rules.',
}

/** A preference write's refusal in words. */
export function preferenceErrorCopy(err: unknown): string {
  let message = ''
  if (err instanceof Error) message = err.message
  else if (typeof err === 'string') message = err
  const code = /HTTP \d+:\s*([a-z_]+)/i.exec(message)?.[1]
  if (code && PREFERENCE_ERROR_COPY[code]) return PREFERENCE_ERROR_COPY[code]
  if (/HTTP 404/.test(message))
    return 'That setting is already gone. Reload to see the current ones.'
  return 'The setting could not be saved. Try again.'
}

/** True when the control plane has no preference routes at all (it predates them). */
export function preferencesRoutesAbsent(error: unknown): boolean {
  return isHttpStatusError(error, 404)
}

/**
 * What a failed preference read says. On the account page a 404 can only mean
 * the control plane predates these settings; on an organization's tab it may
 * also mean the organization cannot be opened, so the words stay general.
 */
export function preferencesLoadFailureCopy(
  error: unknown,
  where: 'account' | 'organization'
): { title: string; body: string } {
  if (preferencesRoutesAbsent(error)) {
    if (where === 'account') {
      return {
        title: 'This control plane has no notification settings yet',
        body: 'It is older than this web interface. Until it is updated, each of your channels keeps its own rules.',
      }
    }
    return {
      title: 'Could not load your notification settings',
      body: 'Reload the page to try again. If it keeps happening, the control plane may be older than this web interface.',
    }
  }
  return {
    title: 'Could not load your notification settings',
    body: 'Reload the page to try again.',
  }
}

/**
 * Category names for the unsubscribe page, which is often opened signed out
 * and so cannot read the catalog; the control plane answers with the code
 * only. An unknown code falls back to "These emails".
 */
const UNSUBSCRIBE_CATEGORY_NAMES: ReadonlyMap<string, string> = new Map([
  ['servers', 'Servers'],
  ['security', 'Security'],
  ['access', 'Access'],
  ['certificates', 'Certificates'],
  ['backups', 'Backups'],
  ['billing', 'Billing'],
  ['platform', 'Control Plane'],
])

export function unsubscribeCategoryName(code: string | null | undefined): string | null {
  return (code ? UNSUBSCRIBE_CATEGORY_NAMES.get(code) : undefined) ?? null
}

/**
 * What the unsubscribe page says after the button press. The undo sentence
 * names what to look for: an unsubscribe for one category is a setting with
 * its own Remove; one without a category turns the Email level itself off.
 */
export function unsubscribeResultCopy(
  result: NotificationUnsubscribeResult,
  categoryName?: string | null
): { tone: 'info' | 'warning'; title: string; body: string } {
  if (result.ok) {
    const what = categoryName ? `${categoryName} emails` : 'These emails'
    const where = result.organizationId ? ' for this organization' : ''
    const undo = result.categoryCode
      ? `remove the ${categoryName ?? 'category'} setting that says Off`
      : 'set Email to a level other than Off'
    return {
      tone: 'info',
      title: 'You are unsubscribed',
      body: `${what} are turned off${where}. To turn them back on, open your notification settings and ${undo}.`,
    }
  }
  if (result.reason === 'invalid_or_expired') {
    return {
      tone: 'warning',
      title: 'This link does not work any more',
      body: 'It may have expired or been used already. Sign in and change your notification settings instead.',
    }
  }
  return {
    tone: 'warning',
    title: 'Nothing was changed',
    body: 'The control plane could not apply this unsubscribe. Sign in and change your notification settings instead.',
  }
}
