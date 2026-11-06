import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import {
  Button,
  ButtonRow,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
  SettingRow,
  TextLink,
  Toggle,
  type SelectOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type {
  NotificationEffectiveLevels,
  NotificationLevel,
  NotificationPreferenceRow,
  NotificationPreferenceScope,
  NotificationPreferences,
  SettableNotificationKind,
} from '@/lib/instance-api'
import {
  activePreset,
  availableKinds,
  categoryRowAt,
  effectiveFromLabel,
  groupOverrides,
  kindRowAt,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  nothingTurnedOn,
  overrideScopes,
  overrideSummary,
  preferenceErrorCopy,
  PREFERENCE_KIND_LABEL,
  PRESET_OPTIONS,
  rowIsAtScope,
  rowScopeWords,
  rowSubjectWords,
  scopeKey,
  SCOPE_WORD,
  scopeSource,
  type PreferenceNames,
} from '@/lib/notification-preferences'
import { orgSettingsTabHref } from '@/lib/org-navigation'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { useEnvironments } from '@/lib/queries/environments'
import {
  useApplyNotificationPreset,
  useDeleteNotificationPreference,
  useEffectiveNotificationLevels,
  useNotificationPreferencesForOrganizations,
  useNotificationPreferencesQuery,
  usePutNotificationPreference,
  useUpdateNotificationSettings,
} from '@/lib/queries/notification-preferences'
import { useProjects } from '@/lib/queries/projects'
import { useOrgServers } from '@/lib/queries/servers'
import { colors, spacing } from '@/lib/theme'

/** Quick presets: the obvious first step, since nothing arrives until something is on. */
function PresetPicker({
  organizationId,
  rows,
  presets,
}: Readonly<{
  organizationId: string | null
  rows: readonly NotificationPreferenceRow[]
  presets: NotificationPreferences['presets'] | undefined
}>) {
  const apply = useApplyNotificationPreset()
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const current = activePreset(rows, presets, { organizationId })
  return (
    <View style={styles.block}>
      <Text style={styles.subheading}>Quick Presets</Text>
      <ButtonRow>
        {PRESET_OPTIONS.map((preset) => (
          <Button
            key={preset.id}
            label={preset.label}
            size="sm"
            variant={current === preset.id ? 'primary' : 'secondary'}
            accessibilityLabel={
              current === preset.id ? `${preset.label}, chosen` : `Use ${preset.label}`
            }
            busy={apply.isPending && pending === preset.id}
            disabled={apply.isPending}
            onPress={() => {
              setPending(preset.id)
              setMessage(null)
              void apply.run({ organizationId, preset: preset.id }).then((result) => {
                setPending(null)
                if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
              })
            }}
          />
        ))}
      </ButtonRow>
      <View style={styles.presetNotes}>
        {PRESET_OPTIONS.map((p) => (
          <Text key={p.id} style={panelStyles.muted}>
            {p.label}: {p.description}
          </Text>
        ))}
      </View>
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

/** One level picker per channel kind at one scope, each with where its level comes from. */
function KindLevels({
  scope,
  rows,
  effective,
  kinds,
}: Readonly<{
  scope: NotificationPreferenceScope
  rows: readonly NotificationPreferenceRow[]
  effective: NotificationEffectiveLevels | undefined
  kinds: readonly SettableNotificationKind[]
}>) {
  const put = usePutNotificationPreference()
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  const here = scopeSource(scope)
  const busy = put.isPending || remove.isPending
  if (!effective) return <LoadingState label="Loading levels…" />

  const setLevel = (kind: SettableNotificationKind, level: NotificationLevel) => {
    setMessage(null)
    void put
      .run({ ...scope, organizationId: scope.organizationId ?? null, kind, level })
      .then((result) => {
        if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
      })
  }

  return (
    <View style={styles.block}>
      {kinds.map((kind) => {
        const own = kindRowAt(rows, scope, kind)
        const level = effective[kind]
        return (
          <View key={kind} style={styles.kindRow}>
            <View style={styles.kindHead}>
              <Text style={styles.kindLabel}>{PREFERENCE_KIND_LABEL[kind]}</Text>
              <Text style={panelStyles.muted}>{effectiveFromLabel(level, here)}</Text>
              {own ? (
                <TextLink
                  label="Reset"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={`Reset ${PREFERENCE_KIND_LABEL[kind]} to inherited`}
                  onPress={() => {
                    setMessage(null)
                    void remove.run(own.id).then((result) => {
                      if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
                    })
                  }}
                />
              ) : null}
            </View>
            <SegmentedControl
              options={LEVEL_OPTIONS}
              value={level.level}
              onChange={(next) => setLevel(kind, next)}
              disabled={busy}
              accessibilityLabel={`${PREFERENCE_KIND_LABEL[kind]} level`}
            />
          </View>
        )
      })}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

/** Organization-level overrides per category, for every channel kind at once. */
function CategoryLevels({
  organizationId,
  rows,
  categories,
}: Readonly<{
  organizationId: string
  rows: readonly NotificationPreferenceRow[]
  categories: readonly { code: string; name: string }[]
}>) {
  const put = usePutNotificationPreference()
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  const scope = { organizationId }
  const options: SelectOption[] = LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
  const busy = put.isPending || remove.isPending
  return (
    <View style={styles.block}>
      <Text style={styles.subheading}>Categories</Text>
      <Text style={panelStyles.muted}>
        A category set here wins over the levels above for every channel in this organization.
      </Text>
      {categories.map((category) => {
        const own = categoryRowAt(rows, scope, category.code)
        return (
          <SettingRow key={category.code} label={category.name}>
            <Select
              value={own?.level ?? null}
              options={options}
              placeholder="Same as Above"
              noneLabel="Same as Above"
              disabled={busy}
              accessibilityLabel={`${category.name} level`}
              onChange={(next) => {
                setMessage(null)
                const done = (result: { ok: boolean; cause?: unknown }) => {
                  if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
                }
                if (next === null) {
                  if (own) void remove.run(own.id).then(done)
                  return
                }
                void put
                  .run({
                    organizationId,
                    categoryCode: category.code,
                    kind: null,
                    level: next as NotificationLevel,
                  })
                  .then(done)
              }}
            />
          </SettingRow>
        )
      })}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

type OverrideTarget = {
  key: string
  label: string
  scope: NotificationPreferenceScope & { organizationId: string }
}

/** One project, environment or server: closed it costs nothing; open it reads its levels. */
function ScopeOverrideCard({
  target,
  rows,
  kinds,
  initiallyOpen,
}: Readonly<{
  target: OverrideTarget
  rows: readonly NotificationPreferenceRow[]
  kinds: readonly SettableNotificationKind[]
  initiallyOpen: boolean
}>) {
  const [open, setOpen] = useState(initiallyOpen)
  const remove = useDeleteNotificationPreference()
  const effective = useEffectiveNotificationLevels(target.scope, { enabled: open })
  const own = rows.filter((r) => rowIsAtScope(r, target.scope))
  const summary = overrideSummary(own)
  return (
    <View style={styles.card}>
      <View style={styles.kindHead}>
        <Text style={styles.kindLabel}>{target.label}</Text>
        <Text style={panelStyles.muted}>{summary}</Text>
      </View>
      <ButtonRow>
        <TextLink
          label={open ? 'Hide Levels' : 'Show Levels'}
          size="sm"
          expanded={open}
          onPress={() => setOpen((v) => !v)}
        />
        {own.length > 0 ? (
          <TextLink
            label="Reset All"
            size="sm"
            disabled={remove.isPending}
            accessibilityLabel={`Reset every setting for ${target.label}`}
            onPress={() => {
              void Promise.all(own.map((r) => remove.run(r.id)))
            }}
          />
        ) : null}
      </ButtonRow>
      {open ? (
        <KindLevels scope={target.scope} rows={rows} effective={effective.data} kinds={kinds} />
      ) : null}
    </View>
  )
}

/** Project, environment and server overrides inside one organization. */
function ScopeOverrides({
  organizationId,
  rows,
  kinds,
}: Readonly<{
  organizationId: string
  rows: readonly NotificationPreferenceRow[]
  kinds: readonly SettableNotificationKind[]
}>) {
  const projects = useProjects(organizationId)
  const environments = useEnvironments(organizationId)
  const servers = useOrgServers(organizationId)
  const [added, setAdded] = useState<string[]>([])

  const targets = useMemo(() => {
    const map = new Map<string, OverrideTarget>()
    const projectNames = new Map(
      (projects.data?.projects ?? []).map((p) => [p.id, p.name ?? 'Untitled project'])
    )
    for (const p of projects.data?.projects ?? []) {
      const scope = { organizationId, projectId: p.id }
      map.set(scopeKey(scope), {
        key: scopeKey(scope),
        label: `Project ${p.name ?? 'Untitled project'}`,
        scope,
      })
    }
    for (const e of environments.data?.environments ?? []) {
      const scope = { organizationId, projectId: e.projectId, environmentId: e.id }
      map.set(scopeKey(scope), {
        key: scopeKey(scope),
        label: `Environment ${projectNames.get(e.projectId) ?? 'Project'} › ${e.name ?? 'Untitled'}`,
        scope,
      })
    }
    for (const s of servers.data?.servers ?? []) {
      const scope = { organizationId, serverId: s.id }
      map.set(scopeKey(scope), {
        key: scopeKey(scope),
        label: `Server ${s.name ?? s.id}`,
        scope,
      })
    }
    return map
  }, [environments.data, organizationId, projects.data, servers.data])

  const existing = overrideScopes(rows, organizationId)
  const shown: { target: OverrideTarget; fresh: boolean }[] = []
  const shownKeys = new Set<string>()
  for (const s of existing) {
    const target = targets.get(s.key) ?? {
      key: s.key,
      label: `${SCOPE_WORD[s.source]} (deleted or not visible to you)`,
      scope: { ...s.scope, organizationId },
    }
    shown.push({ target, fresh: false })
    shownKeys.add(s.key)
  }
  for (const key of added) {
    const target = targets.get(key)
    if (target && !shownKeys.has(key)) {
      shown.push({ target, fresh: true })
      shownKeys.add(key)
    }
  }
  const addOptions: SelectOption[] = [...targets.values()]
    .filter((t) => !shownKeys.has(t.key))
    .map((t) => ({ value: t.key, label: t.label }))

  return (
    <View style={styles.block}>
      <Text style={styles.subheading}>Projects, Environments and Servers</Text>
      <Text style={panelStyles.muted}>
        A project, environment or server set here wins over the organization levels. The most
        specific one decides.
      </Text>
      {shown.length === 0 ? (
        <Text style={panelStyles.muted}>No overrides yet.</Text>
      ) : (
        shown.map(({ target, fresh }) => (
          <ScopeOverrideCard
            key={target.key}
            target={target}
            rows={rows}
            kinds={kinds}
            initiallyOpen={fresh}
          />
        ))
      )}
      {addOptions.length > 0 ? (
        <Select
          value={null}
          options={addOptions}
          placeholder="Add Override…"
          searchPlaceholder="Filter projects, environments and servers"
          accessibilityLabel="Add an override for a project, environment or server"
          onChange={(key) => {
            if (key) setAdded((list) => [...list, key])
          }}
        />
      ) : null}
    </View>
  )
}

/**
 * Organization Settings › Notifications, "Your Notifications": what this
 * person hears from this organization. Every member can use it.
 */
export function OrganizationNotificationPreferences({ orgId }: Readonly<{ orgId: string }>) {
  const query = useNotificationPreferencesQuery(orgId)
  const data = query.data
  const kinds = useMemo(() => availableKinds(data?.channels ?? []), [data?.channels])
  const scope = { organizationId: orgId }
  let body: ReactNode
  if (query.isLoading) body = <LoadingState label="Loading your notification settings…" />
  else if (query.isError || !data) {
    body = (
      <InlineNotice
        tone="warning"
        title="Could not load your notification settings"
        body="Reload the page to try again."
      />
    )
  } else {
    body = (
      <>
        {nothingTurnedOn(data.effective, kinds) ? (
          <InlineNotice
            tone="warning"
            title="Nothing is turned on"
            body="You will not hear anything from this organization, not even in the bell, until you choose a preset or a level below."
          />
        ) : null}
        <PresetPicker organizationId={orgId} rows={data.rows} presets={data.presets} />
        <KindLevels scope={scope} rows={data.rows} effective={data.effective} kinds={kinds} />
        <CategoryLevels
          organizationId={orgId}
          rows={data.rows}
          categories={data.catalog.categories}
        />
        <ScopeOverrides organizationId={orgId} rows={data.rows} kinds={kinds} />
      </>
    )
  }
  return (
    <SectionPanel
      title="Your Notifications"
      hint="What you hear from this organization. Only you see these settings."
    >
      <View style={styles.stack}>{body}</View>
    </SectionPanel>
  )
}

/** Account › Notifications: the global levels (every organization) and the administrator switch. */
export function GlobalNotificationPreferences() {
  const query = useNotificationPreferencesQuery(null)
  const settings = useUpdateNotificationSettings()
  const data = query.data
  const kinds = useMemo(() => availableKinds(data?.channels ?? []), [data?.channels])
  let body: ReactNode
  if (query.isLoading) body = <LoadingState label="Loading your notification settings…" />
  else if (query.isError || !data) {
    body = (
      <InlineNotice
        tone="warning"
        title="Could not load your notification settings"
        body="Reload the page to try again."
      />
    )
  } else {
    body = (
      <>
        {nothingTurnedOn(data.effective, kinds) ? (
          <InlineNotice
            tone="warning"
            title="No global levels set"
            body="Organizations you have set one by one still apply. Choose a preset here to hear every organization you belong to."
          />
        ) : null}
        <PresetPicker organizationId={null} rows={data.rows} presets={data.presets} />
        <KindLevels scope={{}} rows={data.rows} effective={data.effective} kinds={kinds} />
        {data.administrator ? (
          <SettingRow
            label="Hear Every Organization"
            description="As an administrator you only hear the organizations you belong to. Turn this on to hear every organization on this control plane."
          >
            <Toggle
              value={data.allOrganizations}
              busy={settings.isPending}
              onValueChange={(next) => void settings.run(next)}
              accessibilityLabel="Hear every organization"
            />
          </SettingRow>
        ) : null}
      </>
    )
  }
  return (
    <SectionPanel
      title="Global Notifications"
      hint="Every organization you belong to. An organization's own settings win over these."
    >
      <View style={styles.stack}>{body}</View>
    </SectionPanel>
  )
}

function OverrideRow({
  row,
  names,
}: Readonly<{ row: NotificationPreferenceRow; names: PreferenceNames }>) {
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <View style={styles.overrideRow}>
      <View style={styles.overrideText}>
        <Text style={styles.overrideTitle}>
          {rowScopeWords(row, names)}: {LEVEL_LABEL[row.level]}
        </Text>
        <Text style={panelStyles.muted}>{rowSubjectWords(row, names)}</Text>
        {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      </View>
      <Button
        label="Remove"
        size="sm"
        variant="ghost"
        busy={remove.isPending}
        accessibilityLabel={`Remove ${rowScopeWords(row, names)} ${rowSubjectWords(row, names)}`}
        onPress={() => {
          setMessage(null)
          void remove.run(row.id).then((result) => {
            if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
          })
        }}
      />
    </View>
  )
}

/** Account › Notifications: every row the person has, across organizations, with Remove. */
export function NotificationOverridesList() {
  const router = useRouter()
  const organizationsQuery = useOrganizationsQuery()
  const organizations = useMemo(
    () => organizationsQuery.data?.organizations ?? [],
    [organizationsQuery.data]
  )
  const globalQuery = useNotificationPreferencesQuery(null)
  const orgQueries = useNotificationPreferencesForOrganizations(organizations.map((o) => o.id))
  const organizationNames = useMemo(
    () => new Map(organizations.map((o) => [o.id, o.name ?? 'Untitled organization'])),
    [organizations]
  )
  const reads = [globalQuery.data?.rows ?? [], ...orgQueries.map((q) => q.data?.rows ?? [])]
  const groups = groupOverrides(reads, organizationNames)
  const catalog = globalQuery.data?.catalog
  const names: PreferenceNames = {
    organizations: organizationNames,
    categories: new Map((catalog?.categories ?? []).map((c) => [c.code, c.name])),
    topics: new Map((catalog?.topics ?? []).map((t) => [t.code, t.name])),
    channels: new Map((globalQuery.data?.channels ?? []).map((c) => [c.id, c.label])),
  }
  const loading = globalQuery.isLoading || orgQueries.some((q) => q.isLoading)
  const openOrganization = (organizationId: string | null) => {
    if (organizationId) router.push(orgSettingsTabHref(organizationId, 'notifications') as Href)
  }

  let body: ReactNode
  if (loading) body = <LoadingState label="Loading your overrides…" />
  else if (groups.length === 0) {
    body = <Text style={panelStyles.muted}>You have not set anything yet.</Text>
  } else {
    body = groups.map((group) => (
      <View key={group.organizationId ?? 'global'} style={styles.block}>
        <View style={styles.kindHead}>
          <Text style={styles.subheading}>{group.title}</Text>
          {group.organizationId ? (
            <TextLink
              label="Open Settings"
              size="sm"
              accessibilityLabel={`Open the notification settings of ${group.title}`}
              onPress={() => openOrganization(group.organizationId)}
            />
          ) : null}
        </View>
        {group.rows.map((row) => (
          <OverrideRow key={row.id} row={row} names={names} />
        ))}
      </View>
    ))
  }
  return (
    <SectionPanel
      title="Notification Overrides"
      hint="Everything you have set, in every organization. Remove one to inherit again."
    >
      <View style={styles.stack}>{body}</View>
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  presetNotes: {
    gap: 2,
  },
  block: {
    gap: spacing.sm,
  },
  subheading: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  kindRow: {
    gap: 6,
  },
  kindHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kindLabel: {
    color: colors.textTitle,
    fontSize: 14,
    fontWeight: '600',
  },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
  },
  overrideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  overrideText: {
    flex: 1,
    gap: 2,
  },
  overrideTitle: {
    color: colors.textBody,
    fontSize: 13,
  },
})
