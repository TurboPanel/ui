import { describe, expect, it } from 'vitest'
import type {
  NotificationEffectiveLevels,
  NotificationPreferenceRow,
  NotificationPreferences,
} from '@/lib/instance-api'
import {
  activePreset,
  availableKinds,
  categoryInEffectWords,
  categoryPictures,
  categoryRowAt,
  channelPreferenceKind,
  effectiveFromLabel,
  groupOverrides,
  kindRowAt,
  noLevelsSet,
  nothingTurnedOn,
  otherRowsAt,
  overrideScopes,
  overrideSummary,
  preferenceErrorCopy,
  preferencesLoadFailureCopy,
  preferencesRoutesAbsent,
  resolvePreferenceLevel,
  rowHasEnded,
  rowScopeWords,
  rowShape,
  rowSubjectWords,
  rowTargetWords,
  scopeSource,
  somethingResolvesOn,
  unreadBadgeLabel,
  unsubscribeCategoryName,
  unsubscribeResultCopy,
} from '@/lib/notification-preferences'

const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PROJECT = '00000000-0000-4000-8000-0000000000a1'
const ENV = '00000000-0000-4000-8000-0000000000b1'
const SERVER = '00000000-0000-4000-8000-0000000000c1'
const OTHER_PROJECT = '00000000-0000-4000-8000-0000000000a2'
const CHANNEL = '00000000-0000-4000-8000-0000000000d1'
/** A fixed clock: rows with an end time are judged against it. */
const NOW = Date.parse('2026-11-09T12:00:00Z')

let seq = 0
function row(patch: Partial<NotificationPreferenceRow>): NotificationPreferenceRow {
  seq += 1
  return {
    id: `row-${String(seq).padStart(3, '0')}`,
    userId: 'u-1',
    organizationId: null,
    projectId: null,
    environmentId: null,
    serviceId: null,
    serverId: null,
    destinationId: null,
    channelId: null,
    categoryCode: null,
    topicCode: null,
    kind: null,
    level: 'all',
    endsAt: null,
    scope: 'global',
    ...patch,
  }
}

const PRESETS: NotificationPreferences['presets'] = {
  everything: { inbox: 'all', email: 'all' },
  recommended: { inbox: 'all', email: 'warning' },
  critical: { inbox: 'critical', email: 'critical' },
  nothing: { inbox: 'none', email: 'none' },
}

describe('quick presets', () => {
  it('names the preset the bell and email rows at this scope match', () => {
    const rows = [
      row({ organizationId: ORG, kind: 'inbox', level: 'all' }),
      row({ organizationId: ORG, kind: 'email', level: 'warning' }),
      row({ kind: 'inbox', level: 'none' }),
    ]
    expect(activePreset(rows, PRESETS, { organizationId: ORG })).toBe('recommended')
    expect(activePreset(rows, PRESETS, { organizationId: null })).toBeNull()
  })

  it('is null for a hand-made mix or a missing kind', () => {
    const mix = [row({ kind: 'inbox', level: 'critical' }), row({ kind: 'email', level: 'all' })]
    expect(activePreset(mix, PRESETS, {})).toBeNull()
    expect(activePreset([row({ kind: 'inbox', level: 'all' })], PRESETS, {})).toBeNull()
    expect(activePreset([], undefined, {})).toBeNull()
  })

  it('ignores category, topic and project rows when matching', () => {
    const rows = [
      row({ kind: 'inbox', level: 'none', categoryCode: 'servers' }),
      row({ kind: 'inbox', level: 'none' }),
      row({ kind: 'email', level: 'none' }),
      row({ organizationId: ORG, projectId: PROJECT, kind: 'email', level: 'all' }),
    ]
    expect(activePreset(rows, PRESETS, {})).toBe('nothing')
  })
})

describe('kinds and effective labels', () => {
  it('offers Chat and Webhook only when the person has such a channel', () => {
    expect(availableKinds([{ kind: 'email' }])).toEqual(['inbox', 'email'])
    expect(availableKinds([{ kind: 'discord' }, { kind: 'webhook' }])).toEqual([
      'inbox',
      'email',
      'chat',
      'webhook',
    ])
    expect(channelPreferenceKind('telegram')).toBe('chat')
    expect(channelPreferenceKind('push')).toBeNull()
  })

  it('says where an effective level comes from', () => {
    expect(effectiveFromLabel({ source: 'global' }, 'organization')).toBe(
      'Effective from Every Organization'
    )
    expect(effectiveFromLabel({ source: 'organization' }, 'project')).toBe(
      'Effective from Organization'
    )
    expect(effectiveFromLabel({ source: 'project' }, 'project')).toBe('Set here')
    expect(effectiveFromLabel({ source: 'destination' }, 'organization')).toBe(
      'Effective from Backup Target'
    )
    expect(effectiveFromLabel({ source: 'default' }, 'global')).toBe('Off until you turn it on')
  })

  it('reads the scope a card stands at', () => {
    expect(scopeSource({})).toBe('global')
    expect(scopeSource({ organizationId: ORG })).toBe('organization')
    expect(scopeSource({ organizationId: ORG, projectId: PROJECT })).toBe('project')
    expect(scopeSource({ organizationId: ORG, projectId: PROJECT, environmentId: ENV })).toBe(
      'environment'
    )
    expect(scopeSource({ organizationId: ORG, serverId: SERVER })).toBe('server')
  })

  it('finds the kind and category rows at exactly one scope', () => {
    const kindRow = row({ organizationId: ORG, kind: 'email', level: 'critical' })
    const catRow = row({ organizationId: ORG, categoryCode: 'backups', level: 'none' })
    const rows = [row({ kind: 'email' }), kindRow, catRow]
    expect(kindRowAt(rows, { organizationId: ORG }, 'email')).toBe(kindRow)
    expect(kindRowAt(rows, { organizationId: ORG }, 'inbox')).toBeUndefined()
    expect(categoryRowAt(rows, { organizationId: ORG }, 'backups')).toBe(catRow)
    expect(categoryRowAt(rows, {}, 'backups')).toBeUndefined()
  })
})

describe('override list', () => {
  it('lists each scope below the organization once, project before server', () => {
    const rows = [
      row({ organizationId: ORG, serverId: SERVER, kind: 'inbox' }),
      row({ organizationId: ORG, projectId: PROJECT, kind: 'inbox' }),
      row({ organizationId: ORG, projectId: PROJECT, kind: 'email' }),
      row({ organizationId: ORG, kind: 'email' }),
      row({ organizationId: OTHER, projectId: PROJECT, kind: 'email' }),
    ]
    expect(overrideScopes(rows, ORG).map((s) => s.source)).toEqual(['project', 'server'])
  })

  it('dedupes the rows every organization read repeats, Every Organization first', () => {
    const global = row({ kind: 'inbox', level: 'all' })
    const inOrg = row({ organizationId: ORG, projectId: PROJECT, kind: 'email', level: 'none' })
    const orgWide = row({ organizationId: ORG, kind: 'inbox', level: 'critical' })
    const inOther = row({ organizationId: OTHER, kind: 'inbox' })
    const groups = groupOverrides(
      [[global], [global, inOrg, orgWide], [global, inOther]],
      new Map([
        [ORG, 'Zeta'],
        [OTHER, 'Alpha'],
      ])
    )
    expect(groups.map((g) => g.title)).toEqual(['Every Organization', 'Alpha', 'Zeta'])
    expect(groups[0].rows).toEqual([global])
    expect(groups[2].rows).toEqual([orgWide, inOrg])
  })

  it('sums up a closed override card', () => {
    expect(overrideSummary([])).toBe('Inherits the organization levels')
    expect(
      overrideSummary([
        row({ organizationId: ORG, projectId: PROJECT, kind: 'inbox', level: 'all' }),
        row({ organizationId: ORG, projectId: PROJECT, kind: 'email', level: 'none' }),
      ])
    ).toBe('Bell: All · Email: Off')
    // What an email unsubscribe for a project writes reads as what it is, after the levels.
    expect(
      overrideSummary(
        [
          row({ categoryCode: 'servers', kind: 'email', level: 'none' }),
          row({ kind: 'inbox', level: 'all' }),
        ],
        { categories: new Map([['servers', 'Servers']]) }
      )
    ).toBe('Bell: All · Servers · Email: Off')
    expect(
      overrideSummary([
        row({ kind: 'inbox' }),
        row({ kind: 'email' }),
        row({ topicCode: 'a' }),
        row({ topicCode: 'b' }),
        row({ topicCode: 'c' }),
      ])
    ).toBe('Bell: All · Email: All · a · Every Channel: All · and 2 more')
  })

  it('puts a row into words', () => {
    const r = row({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      categoryCode: 'servers',
      kind: 'email',
    })
    expect(
      rowScopeWords(r, {
        projects: new Map([[PROJECT, 'Checkout']]),
      })
    ).toBe('Project Checkout › Environment')
    expect(rowSubjectWords(r, { categories: new Map([['servers', 'Servers']]) })).toBe(
      'Servers · Email'
    )
    expect(rowScopeWords(row({}))).toBe('Every Organization')
    expect(rowScopeWords(row({ organizationId: ORG }))).toBe('Whole Organization')
    expect(rowScopeWords(row({ organizationId: ORG, destinationId: 'd' }))).toBe('Backup Target')
    expect(rowScopeWords(row({ organizationId: ORG, serviceId: 's' }))).toBe('Service')
    expect(
      rowScopeWords(row({ organizationId: ORG, serverId: SERVER }), {
        servers: new Map([[SERVER, 'db-1']]),
      })
    ).toBe('Server db-1')
    expect(rowSubjectWords(row({ kind: 'inbox' }))).toBe('Everything · Bell')
    expect(rowSubjectWords(row({}))).toBe('Everything · Every Channel')
    expect(rowSubjectWords(row({ topicCode: 'server.offline' }))).toBe(
      'server.offline · Every Channel'
    )
  })

  it('names where a row sends: one channel, one kind, or every channel', () => {
    const names = { channels: new Map([[CHANNEL, 'Work Email']]) }
    expect(rowTargetWords(row({ channelId: CHANNEL }), names)).toBe('Work Email')
    expect(rowTargetWords(row({ channelId: CHANNEL }))).toBe('One Channel')
    expect(rowTargetWords(row({ kind: 'push' }))).toBe('Push')
    expect(rowTargetWords(row({ kind: 'chat' }))).toBe('Chat')
    expect(rowTargetWords(row({}))).toBe('Every Channel')
  })
})

describe('small words', () => {
  it('caps the unread badge at 99+', () => {
    expect(unreadBadgeLabel(0)).toBe('0')
    expect(unreadBadgeLabel(99)).toBe('99')
    expect(unreadBadgeLabel(100)).toBe('99+')
  })

  it('maps refusals to sentences', () => {
    expect(preferenceErrorCopy(new Error('x failed: HTTP 422: scope_not_in_organization'))).toMatch(
      /not in this organization/
    )
    expect(preferenceErrorCopy(new Error('x failed: HTTP 404'))).toMatch(/already gone/)
    expect(preferenceErrorCopy(undefined)).toMatch(/could not be saved/)
    expect(preferenceErrorCopy('x failed: HTTP 404')).toMatch(/already gone/)
  })

  it('knows the category names without the catalog, and nothing else', () => {
    expect(unsubscribeCategoryName('platform')).toBe('Control Plane')
    expect(unsubscribeCategoryName('constructor')).toBeNull()
    expect(unsubscribeCategoryName(null)).toBeNull()
    expect(unsubscribeCategoryName(undefined)).toBeNull()
  })

  it('tells a control plane without these settings from a read that failed', () => {
    const absent = new Error('/api/client/v1/notification-preferences failed: HTTP 404')
    const down = new Error('/api/client/v1/notification-preferences failed: HTTP 503')
    expect(preferencesRoutesAbsent(absent)).toBe(true)
    expect(preferencesRoutesAbsent(down)).toBe(false)
    expect(preferencesRoutesAbsent(undefined)).toBe(false)
    expect(preferencesLoadFailureCopy(absent, 'account').title).toBe(
      'This control plane has no notification settings yet'
    )
    // On an organization's tab a 404 may also be an organization that cannot be opened.
    expect(preferencesLoadFailureCopy(absent, 'organization').title).toBe(
      'Could not load your notification settings'
    )
    expect(preferencesLoadFailureCopy(absent, 'organization').body).toMatch(/may be older/)
    expect(preferencesLoadFailureCopy(down, 'account')).toEqual({
      title: 'Could not load your notification settings',
      body: 'Reload the page to try again.',
    })
  })

  it('says what the unsubscribe did', () => {
    const backups = unsubscribeResultCopy(
      { ok: true, organizationId: ORG, categoryCode: 'backups' },
      unsubscribeCategoryName('backups')
    ).body
    expect(backups).toMatch(/^Backups emails are turned off for this organization\./)
    // The undo sentence names what to remove, where it can be removed.
    expect(backups).toMatch(/remove the Backups setting that says Off/)
    const unknown = unsubscribeResultCopy(
      { ok: true, organizationId: null, categoryCode: 'future_category' },
      unsubscribeCategoryName('future_category')
    ).body
    expect(unknown).toMatch(/^These emails are turned off\. /)
    expect(unknown).toMatch(/remove the category setting that says Off/)
    // No category: the unsubscribe turned the Email level itself off.
    expect(
      unsubscribeResultCopy({ ok: true, organizationId: ORG, categoryCode: null }).body
    ).toMatch(/set Email to a level other than Off/)
    expect(unsubscribeResultCopy({ ok: false, reason: 'invalid_or_expired' }).tone).toBe('warning')
    expect(unsubscribeResultCopy({ ok: false, reason: 'not_applied' }).title).toBe(
      'Nothing was changed'
    )
  })
})

function level(
  value: NotificationEffectiveLevels['inbox']['level'],
  source: NotificationEffectiveLevels['inbox']['source']
): NotificationEffectiveLevels['inbox'] {
  return { level: value, source, sourceId: source === 'default' ? null : 'r' }
}

const UNSET = level('none', 'default')

function effective(patch: Partial<NotificationEffectiveLevels>): NotificationEffectiveLevels {
  return { inbox: UNSET, email: UNSET, chat: UNSET, webhook: UNSET, ...patch }
}

const CATEGORIES = [
  { code: 'servers', name: 'Servers' },
  { code: 'backups', name: 'Backups' },
]

const CATALOG: NotificationPreferences['catalog'] = {
  categories: CATEGORIES,
  topics: [
    {
      code: 'server.offline',
      name: 'A server went offline',
      categoryCode: 'servers',
      severity: 'critical',
      audience: 'members',
      scope: 'organization',
      urgent: true,
    },
    {
      code: 'backup.target_changed',
      name: 'Where backups are copied to changed',
      categoryCode: 'backups',
      severity: 'warning',
      audience: 'managers',
      scope: 'organization',
      urgent: true,
    },
  ],
}

const ACCOUNT_EMAIL = {
  id: 'ch-primary',
  kind: 'email',
  label: 'Account Email',
  isPrimary: true,
  verified: true,
  disabled: false,
  address: 'a@example.test',
} as const

const WORK_EMAIL = { ...ACCOUNT_EMAIL, id: CHANNEL, label: 'Work Email', isPrimary: false }

describe('the most specific row decides, as on the control plane', () => {
  const EMAIL = { kind: 'email' } as const

  it('scope beats subject: a project row wins over a category row for every organization', () => {
    // The control plane's own example (`resolve.hostfree.test.ts`): keep the two in step.
    const rows = [
      row({ categoryCode: 'servers', level: 'none' }),
      row({ organizationId: ORG, projectId: PROJECT, level: 'all' }),
    ]
    const at = (projectId: string) =>
      resolvePreferenceLevel(
        rows,
        { organizationId: ORG, projectId, categoryCode: 'servers', topicCode: 'server.offline' },
        EMAIL,
        NOW
      ).level
    expect(at(PROJECT)).toBe('all')
    // The inverse: in another project the category row still decides.
    expect(at(OTHER_PROJECT)).toBe('none')
  })

  it('ranks scope from a resource down to every organization', () => {
    const everywhere = row({ level: 'critical' })
    const organization = row({ organizationId: ORG, level: 'warning' })
    const project = row({ organizationId: ORG, projectId: PROJECT, level: 'all' })
    const environment = row({
      organizationId: ORG,
      projectId: PROJECT,
      environmentId: ENV,
      level: 'none',
    })
    const server = row({ organizationId: ORG, serverId: SERVER, level: 'critical' })
    const rows = [everywhere, organization, project, environment, server]
    const decide = (event: Parameters<typeof resolvePreferenceLevel>[1]) =>
      resolvePreferenceLevel(rows, event, EMAIL, NOW).row
    expect(decide({ organizationId: OTHER })).toBe(everywhere)
    expect(decide({ organizationId: ORG })).toBe(organization)
    expect(decide({ organizationId: ORG, projectId: PROJECT })).toBe(project)
    expect(decide({ organizationId: ORG, projectId: PROJECT, environmentId: ENV })).toBe(
      environment
    )
    expect(decide({ organizationId: ORG, serverId: SERVER })).toBe(server)
  })

  it('within one scope: one event, then a category, then every event', () => {
    const all = row({ organizationId: ORG, level: 'all' })
    const category = row({ organizationId: ORG, categoryCode: 'servers', level: 'critical' })
    const topic = row({ organizationId: ORG, topicCode: 'server.offline', level: 'none' })
    const rows = [all, category, topic]
    const event = { organizationId: ORG, categoryCode: 'servers' }
    expect(
      resolvePreferenceLevel(rows, { ...event, topicCode: 'server.offline' }, EMAIL, NOW).row
    ).toBe(topic)
    expect(
      resolvePreferenceLevel(rows, { ...event, topicCode: 'server.deleted' }, EMAIL, NOW).row
    ).toBe(category)
    expect(resolvePreferenceLevel(rows, { organizationId: ORG }, EMAIL, NOW).row).toBe(all)
  })

  it('within one scope and subject: one channel, then a kind, then every kind', () => {
    const every = row({ organizationId: ORG, categoryCode: 'servers', level: 'all' })
    const kind = row({ organizationId: ORG, categoryCode: 'servers', kind: 'email', level: 'none' })
    const channel = row({
      organizationId: ORG,
      categoryCode: 'servers',
      channelId: CHANNEL,
      level: 'critical',
    })
    const rows = [every, kind, channel]
    const event = { organizationId: ORG, categoryCode: 'servers' }
    expect(
      resolvePreferenceLevel(rows, event, { kind: 'email', channelId: CHANNEL }, NOW).row
    ).toBe(channel)
    expect(resolvePreferenceLevel(rows, event, EMAIL, NOW).row).toBe(kind)
    expect(resolvePreferenceLevel(rows, event, { kind: 'inbox' }, NOW).row).toBe(every)
  })

  it('ignores a row whose end time has passed, and is Off with no row', () => {
    const ended = row({ organizationId: ORG, kind: 'email', endsAt: '2026-11-09T11:59:59Z' })
    const running = row({ kind: 'email', level: 'critical', endsAt: '2026-11-09T12:00:01Z' })
    expect(rowHasEnded(ended, NOW)).toBe(true)
    expect(rowHasEnded(running, NOW)).toBe(false)
    expect(rowHasEnded(row({}), NOW)).toBe(false)
    expect(resolvePreferenceLevel([ended, running], { organizationId: ORG }, EMAIL, NOW).row).toBe(
      running
    )
    expect(resolvePreferenceLevel([ended], { organizationId: ORG }, EMAIL, NOW)).toEqual({
      level: 'none',
      row: null,
    })
  })

  it('sorts a row by what it sets', () => {
    expect(rowShape(row({ kind: 'email' }))).toBe('kind')
    expect(rowShape(row({ categoryCode: 'servers' }))).toBe('category')
    expect(rowShape(row({ categoryCode: 'servers', kind: 'email' }))).toBe('category-target')
    expect(rowShape(row({ categoryCode: 'servers', channelId: CHANNEL }))).toBe('category-target')
    expect(rowShape(row({ topicCode: 'server.offline', kind: 'email' }))).toBe('other')
    expect(rowShape(row({ channelId: CHANNEL }))).toBe('other')
    expect(rowShape(row({}))).toBe('other')
    expect(rowShape(row({ kind: 'push' }))).toBe('other')
  })
})

describe('categories on an organization tab', () => {
  const KINDS = ['inbox', 'email'] as const

  function pictures(
    rows: NotificationPreferenceRow[],
    levels: Partial<NotificationEffectiveLevels>
  ) {
    return categoryPictures({
      rows,
      organizationId: ORG,
      categories: CATEGORIES,
      kinds: KINDS,
      effective: effective(levels),
      nowMs: NOW,
    })
  }

  it('shows the row an email unsubscribe writes, and that email is off for that category', () => {
    // Everything preset in the organization, then "unsubscribe" from a Servers email.
    const inbox = row({ organizationId: ORG, kind: 'inbox', level: 'all' })
    const email = row({ organizationId: ORG, kind: 'email', level: 'all' })
    const unsubscribed = row({
      organizationId: ORG,
      categoryCode: 'servers',
      kind: 'email',
      level: 'none',
    })
    const [servers, backups] = pictures([inbox, email, unsubscribed], {
      inbox: level('all', 'organization'),
      email: level('all', 'organization'),
    })
    expect(servers.own).toBeUndefined()
    expect(servers.targeted).toEqual([unsubscribed])
    expect(servers.differs).toBe(true)
    expect(servers.inEffect).toEqual([
      { kind: 'inbox', level: 'all', source: 'organization', differs: false },
      { kind: 'email', level: 'none', source: 'organization', differs: true },
    ])
    expect(categoryInEffectWords(servers)).toBe('Bell: All · Email: Off (Set here)')
    // The other category is what the levels above say: nothing extra to show.
    expect(backups.differs).toBe(false)
    expect(backups.targeted).toEqual([])
    expect(categoryInEffectWords(backups)).toBe('Bell: All · Email: All')
  })

  it('setting the category to All does not undo the unsubscribe: the row still decides', () => {
    const own = row({ organizationId: ORG, categoryCode: 'servers', level: 'all' })
    const unsubscribed = row({
      organizationId: ORG,
      categoryCode: 'servers',
      kind: 'email',
      level: 'none',
    })
    const [servers] = pictures([own, unsubscribed], {})
    expect(servers.own).toBe(own)
    expect(servers.inEffect).toEqual([
      { kind: 'inbox', level: 'all', source: 'organization', differs: false },
      { kind: 'email', level: 'none', source: 'organization', differs: true },
    ])
    // With the row removed the picker is right again.
    expect(pictures([own], {})[0].differs).toBe(false)
  })

  it('lists a row for one channel without changing the level of its kind', () => {
    const email = row({ organizationId: ORG, kind: 'email', level: 'all' })
    const oneChannel = row({
      organizationId: ORG,
      categoryCode: 'servers',
      channelId: CHANNEL,
      level: 'none',
    })
    const oneKind = row({
      organizationId: ORG,
      categoryCode: 'servers',
      kind: 'inbox',
      level: 'critical',
    })
    const [servers] = pictures([email, oneChannel, oneKind], {
      email: level('all', 'organization'),
    })
    // A kind before a channel, whatever order they were written in.
    expect(servers.targeted).toEqual([oneKind, oneChannel])
    expect(servers.inEffect[1]).toEqual({
      kind: 'email',
      level: 'all',
      source: 'organization',
      differs: false,
    })
    expect(servers.inEffect[0].differs).toBe(true)
  })

  it('says when a setting for every organization decides a category', () => {
    // Email on everywhere, then an unsubscribe that names no organization.
    const email = row({ kind: 'email', level: 'all' })
    const unsubscribed = row({ categoryCode: 'servers', kind: 'email', level: 'none' })
    const [servers] = pictures([email, unsubscribed], { email: level('all', 'global') })
    expect(servers.targeted).toEqual([])
    expect(servers.inEffect[1]).toEqual({
      kind: 'email',
      level: 'none',
      source: 'global',
      differs: true,
    })
    expect(categoryInEffectWords(servers)).toBe(
      'Bell: Off · Email: Off (Effective from Every Organization)'
    )
    // An organization level is more specific than that row, so it wins again.
    const here = row({ organizationId: ORG, kind: 'email', level: 'critical' })
    const [again] = pictures([email, unsubscribed, here], {
      email: level('critical', 'organization'),
    })
    expect(again.differs).toBe(false)
  })

  it('leaves rows for one event and rows that have ended out of a category level', () => {
    const topic = row({ organizationId: ORG, topicCode: 'server.offline', level: 'all' })
    const ended = row({
      organizationId: ORG,
      categoryCode: 'servers',
      level: 'all',
      endsAt: '2026-01-01T00:00:00Z',
    })
    const [servers] = pictures([topic, ended], {})
    expect(servers.own).toBe(ended)
    expect(servers.inEffect.map((k) => k.level)).toEqual(['none', 'none'])
    expect(servers.inEffect.map((k) => k.source)).toEqual(['default', 'default'])
    expect(servers.differs).toBe(false)
  })

  it('lists every other row at a scope, so none is hidden', () => {
    const kind = row({ organizationId: ORG, kind: 'email' })
    const chat = row({ organizationId: ORG, kind: 'chat' })
    const category = row({ organizationId: ORG, categoryCode: 'servers' })
    const targeted = row({ organizationId: ORG, categoryCode: 'servers', kind: 'email' })
    const retired = row({ organizationId: ORG, categoryCode: 'retired', kind: 'email' })
    const topic = row({ organizationId: ORG, topicCode: 'server.offline' })
    const everyKind = row({ organizationId: ORG })
    const inProject = row({ organizationId: ORG, projectId: PROJECT, categoryCode: 'servers' })
    const rows = [kind, chat, category, targeted, retired, topic, everyKind, inProject]
    // The organization tab: the level pickers and the Categories block show the rest.
    expect(
      otherRowsAt(rows, { organizationId: ORG }, { kinds: KINDS, categories: ['servers'] })
    ).toEqual([chat, retired, topic, everyKind])
    // A project card has level pickers only, so a category row there is listed.
    expect(
      otherRowsAt(rows, { organizationId: ORG, projectId: PROJECT }, { kinds: KINDS })
    ).toEqual([inProject])
  })
})

describe('nothing is turned on', () => {
  function data(
    rows: NotificationPreferenceRow[],
    levels: Partial<NotificationEffectiveLevels> = {},
    channels: NotificationPreferences['channels'] = [ACCOUNT_EMAIL]
  ) {
    return { rows, channels, catalog: CATALOG, effective: effective(levels) }
  }

  it('is true for a person who has chosen nothing', () => {
    expect(nothingTurnedOn(data([]), ORG, NOW)).toBe(true)
    expect(nothingTurnedOn(undefined, ORG, NOW)).toBe(false)
    expect(noLevelsSet(undefined, ['inbox'])).toBe(false)
    expect(noLevelsSet({}, ['inbox'])).toBe(true)
  })

  it('is false after a deliberate Nothing preset: that is a choice, not the default', () => {
    const rows = [
      row({ organizationId: ORG, kind: 'inbox', level: 'none' }),
      row({ organizationId: ORG, kind: 'email', level: 'none' }),
    ]
    const picture = data(rows, {
      inbox: level('none', 'organization'),
      email: level('none', 'organization'),
    })
    expect(somethingResolvesOn(picture, ORG, NOW)).toBe(false)
    expect(nothingTurnedOn(picture, ORG, NOW)).toBe(false)
  })

  it('is false when only a category is on', () => {
    const picture = data([row({ organizationId: ORG, categoryCode: 'backups', level: 'all' })])
    expect(noLevelsSet(picture.effective, ['inbox', 'email'])).toBe(true)
    expect(nothingTurnedOn(picture, ORG, NOW)).toBe(false)
  })

  it('is false when only a server or one personal channel is on', () => {
    const server = data([row({ organizationId: ORG, serverId: SERVER, kind: 'inbox' })])
    expect(nothingTurnedOn(server, ORG, NOW)).toBe(false)
    const channel = data(
      [row({ organizationId: ORG, channelId: CHANNEL, level: 'critical' })],
      {},
      [ACCOUNT_EMAIL, WORK_EMAIL, { ...ACCOUNT_EMAIL, id: 'ch-push', kind: 'push' }]
    )
    expect(nothingTurnedOn(channel, ORG, NOW)).toBe(false)
  })

  it('stays true when the only rows turn things off, belong elsewhere, have ended, or have nowhere to go', () => {
    const rows = [
      row({ organizationId: ORG, categoryCode: 'servers', kind: 'email', level: 'none' }),
      row({ organizationId: OTHER, kind: 'inbox', level: 'all' }),
      row({ organizationId: ORG, kind: 'inbox', level: 'all', endsAt: '2026-01-01T00:00:00Z' }),
      // A webhook level with no webhook channel reaches nothing.
      row({ organizationId: ORG, categoryCode: 'servers', kind: 'webhook', level: 'all' }),
    ]
    expect(nothingTurnedOn(data(rows), ORG, NOW)).toBe(true)
  })

  it('still answers for a catalog with no events in it', () => {
    const picture = {
      ...data([row({ organizationId: ORG, categoryCode: 'servers', level: 'all' })]),
      catalog: { categories: CATEGORIES, topics: [] },
    }
    // A category row cannot match an event that names no category.
    expect(somethingResolvesOn(picture, ORG, NOW)).toBe(false)
    expect(
      somethingResolvesOn({ ...picture, rows: [row({ organizationId: ORG })] }, ORG, NOW)
    ).toBe(true)
  })
})
