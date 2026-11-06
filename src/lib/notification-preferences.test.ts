import { describe, expect, it } from 'vitest'
import type { NotificationPreferenceRow, NotificationPreferences } from '@/lib/instance-api'
import {
  activePreset,
  availableKinds,
  categoryRowAt,
  channelPreferenceKind,
  effectiveFromLabel,
  groupOverrides,
  kindRowAt,
  nothingTurnedOn,
  overrideScopes,
  overrideSummary,
  preferenceErrorCopy,
  rowScopeWords,
  rowSubjectWords,
  scopeSource,
  unreadBadgeLabel,
  unsubscribeResultCopy,
} from '@/lib/notification-preferences'

const ORG = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const PROJECT = '00000000-0000-4000-8000-0000000000a1'
const ENV = '00000000-0000-4000-8000-0000000000b1'
const SERVER = '00000000-0000-4000-8000-0000000000c1'

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
    expect(effectiveFromLabel({ source: 'global' }, 'organization')).toBe('Effective from Global')
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

  it('nothing is turned on only when every shown kind is off', () => {
    const off = { level: 'none', source: 'default', sourceId: null } as const
    const on = { level: 'all', source: 'global', sourceId: 'r' } as const
    expect(nothingTurnedOn({ inbox: off, email: off, chat: on }, ['inbox', 'email'])).toBe(true)
    expect(nothingTurnedOn({ inbox: on, email: off }, ['inbox', 'email'])).toBe(false)
    expect(nothingTurnedOn(undefined, ['inbox'])).toBe(false)
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

  it('dedupes the global rows every organization read repeats, Global first', () => {
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
    expect(groups.map((g) => g.title)).toEqual(['Global', 'Alpha', 'Zeta'])
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
    expect(overrideSummary([row({ categoryCode: 'servers' })])).toBe('1 setting')
    expect(overrideSummary([row({ topicCode: 'a' }), row({ topicCode: 'b' })])).toBe('2 settings')
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
    expect(rowScopeWords(row({}))).toBe('Every organization')
    expect(rowScopeWords(row({ organizationId: ORG }))).toBe('Whole organization')
    expect(rowSubjectWords(row({ kind: 'inbox' }))).toBe('Everything · Bell')
    expect(rowSubjectWords(row({}))).toBe('Everything · Every channel')
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
  })

  it('says what the unsubscribe did', () => {
    expect(
      unsubscribeResultCopy({ ok: true, organizationId: ORG, categoryCode: 'backups' }, 'Backups')
        .body
    ).toMatch(/^Backups emails are turned off/)
    expect(unsubscribeResultCopy({ ok: false, reason: 'invalid_or_expired' }).tone).toBe('warning')
    expect(unsubscribeResultCopy({ ok: false, reason: 'not_applied' }).title).toBe(
      'Nothing was changed'
    )
  })
})
