import type {
  NotificationEffectiveLevel,
  NotificationEffectiveLevels,
  NotificationLevel,
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
 * "effective from" labels, which quick preset a scope matches, and the
 * override list. Nothing arrives until a person turns something on, so the
 * words here say so plainly.
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
  global: 'Global',
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

/** True when every kind shown is off at this scope: the screen says nothing is turned on. */
export function nothingTurnedOn(
  effective: Partial<NotificationEffectiveLevels> | undefined,
  kinds: readonly SettableNotificationKind[]
): boolean {
  if (!effective) return false
  return kinds.every((kind) => (effective[kind]?.level ?? 'none') === 'none')
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

/** One line for a closed override card: "Bell: All · Email: Off", or a count, or that it inherits. */
export function overrideSummary(own: readonly NotificationPreferenceRow[]): string {
  if (own.length === 0) return 'Inherits the organization levels'
  const levels = own
    .filter(
      (r) => r.kind !== null && r.kind !== 'push' && r.categoryCode === null && r.topicCode === null
    )
    .map(
      (r) => `${PREFERENCE_KIND_LABEL[r.kind as SettableNotificationKind]}: ${LEVEL_LABEL[r.level]}`
    )
  if (levels.length > 0) return levels.join(' · ')
  return own.length === 1 ? '1 setting' : `${own.length} settings`
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
  if (row.organizationId === null) return 'Every organization'
  const parts: string[] = []
  if (row.projectId) parts.push(named('Project', row.projectId, names.projects))
  if (row.environmentId) parts.push(named('Environment', row.environmentId, names.environments))
  if (row.serverId) parts.push(named('Server', row.serverId, names.servers))
  if (row.serviceId) parts.push('Service')
  if (row.destinationId) parts.push('Backup target')
  if (parts.length === 0) return 'Whole organization'
  return parts.join(' › ')
}

/** What a row is about and where it goes: "Servers · Email", "Everything · Every channel". */
export function rowSubjectWords(
  row: NotificationPreferenceRow,
  names: PreferenceNames = {}
): string {
  let subject = 'Everything'
  if (row.categoryCode) subject = names.categories?.get(row.categoryCode) ?? row.categoryCode
  else if (row.topicCode) subject = names.topics?.get(row.topicCode) ?? row.topicCode
  let target = 'Every channel'
  if (row.channelId) target = names.channels?.get(row.channelId) ?? 'One channel'
  else if (row.kind && row.kind !== 'push') target = PREFERENCE_KIND_LABEL[row.kind]
  else if (row.kind === 'push') target = 'Push'
  return `${subject} · ${target}`
}

export type OverrideGroup = {
  /** `null` = the global rows (every organization). */
  organizationId: string | null
  title: string
  rows: NotificationPreferenceRow[]
}

/**
 * Every row the person has, across the reads (one per organization, each
 * repeating the global rows, plus the global read), grouped: Global first,
 * then each organization by name; inside a group the widest scope first.
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
  const subjectRank = (r: NotificationPreferenceRow) => {
    if (r.topicCode) return 2
    if (r.categoryCode) return 1
    return 0
  }
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
          ? 'Global'
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

/** What the unsubscribe page says after the button press. */
export function unsubscribeResultCopy(
  result: NotificationUnsubscribeResult,
  categoryName?: string | null
): { tone: 'info' | 'warning'; title: string; body: string } {
  if (result.ok) {
    const what = categoryName ? `${categoryName} emails` : 'These emails'
    const where = result.organizationId ? ' for this organization' : ''
    return {
      tone: 'info',
      title: 'You are unsubscribed',
      body: `${what} are turned off${where}. You can turn them back on in your notification settings.`,
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
