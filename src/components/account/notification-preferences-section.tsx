import { useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import {
  CategoryLevels,
  OtherSettings,
  PreferenceRowLine,
} from '@/components/account/notification-category-levels'
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
  categoryPictures,
  effectiveFromLabel,
  groupOverrides,
  kindRowAt,
  LEVEL_LABEL,
  LEVEL_OPTIONS,
  noLevelsSet,
  nothingTurnedOn,
  otherRowsAt,
  overrideScopes,
  overrideSummary,
  preferenceErrorCopy,
  PREFERENCE_KIND_LABEL,
  preferencesLoadFailureCopy,
  PRESET_OPTIONS,
  rowIsAtScope,
  rowScopeWords,
  rowSubjectWords,
  scopeKey,
  SCOPE_WORD,
  scopeSource,
  type OverrideGroup,
  type PreferenceNames,
} from '@/lib/notification-preferences'
import { orgSettingsTabHref } from '@/lib/org-navigation'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { useEnvironments } from '@/lib/queries/environments'
import {
  useApplyNotificationPreset,
  useDeleteNotificationPreference,
  useDeleteNotificationPreferences,
  useEffectiveNotificationLevels,
  useNotificationPreferencesForOrganizations,
  useNotificationPreferencesQuery,
  useNotificationScopeNames,
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
  failed = false,
  kinds,
}: Readonly<{
  scope: NotificationPreferenceScope
  rows: readonly NotificationPreferenceRow[]
  effective: NotificationEffectiveLevels | undefined
  /** The read of the effective levels failed: say so instead of loading for ever. */
  failed?: boolean
  kinds: readonly SettableNotificationKind[]
}>) {
  const put = usePutNotificationPreference()
  const remove = useDeleteNotificationPreference()
  const [message, setMessage] = useState<string | null>(null)
  const here = scopeSource(scope)
  const organizationId = scope.organizationId ?? null
  const busy = put.isPending || remove.isPending
  if (failed) {
    return (
      <Text style={panelStyles.error}>
        Could not load the levels. Reload the page to try again.
      </Text>
    )
  }
  if (!effective) return <LoadingState label="Loading levels…" />

  const setLevel = (kind: SettableNotificationKind, level: NotificationLevel) => {
    setMessage(null)
    void put.run({ ...scope, organizationId, kind, level }).then((result) => {
      if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
    })
  }

  return (
    <View style={styles.block}>
      {kinds.map((kind) => {
        const own = kindRowAt(rows, scope, kind)
        const level = effective[kind]
        const from = effectiveFromLabel(level, here)
        return (
          <View key={kind} style={styles.kindRow}>
            <View style={styles.kindHead}>
              <Text style={styles.kindLabel}>{PREFERENCE_KIND_LABEL[kind]}</Text>
              <Text style={panelStyles.muted}>{from}</Text>
              {own ? (
                <TextLink
                  label="Reset"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={`Reset ${PREFERENCE_KIND_LABEL[kind]} to inherited`}
                  onPress={() => {
                    setMessage(null)
                    void remove.run({ id: own.id, organizationId }).then((result) => {
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
              accessibilityLabel={`${PREFERENCE_KIND_LABEL[kind]} level, ${from}`}
            />
          </View>
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

/**
 * One project, environment or server. Closed it costs nothing; open it reads
 * its levels. A setting here that is not a plain level (an email unsubscribe
 * for a project writes one) is listed without opening the card.
 */
function ScopeOverrideCard({
  target,
  rows,
  kinds,
  names,
  initiallyOpen,
}: Readonly<{
  target: OverrideTarget
  rows: readonly NotificationPreferenceRow[]
  kinds: readonly SettableNotificationKind[]
  names: PreferenceNames
  initiallyOpen: boolean
}>) {
  const [open, setOpen] = useState(initiallyOpen)
  const reset = useDeleteNotificationPreferences()
  const [message, setMessage] = useState<string | null>(null)
  const effective = useEffectiveNotificationLevels(target.scope, { enabled: open })
  const own = rows.filter((r) => rowIsAtScope(r, target.scope))
  const others = otherRowsAt(rows, target.scope, { kinds })
  return (
    <View style={styles.card}>
      <View style={styles.kindHead}>
        <Text style={styles.kindLabel}>{target.label}</Text>
        <Text style={panelStyles.muted}>{overrideSummary(own, names)}</Text>
      </View>
      <ButtonRow>
        <TextLink
          label={open ? 'Hide Levels' : 'Show Levels'}
          size="sm"
          expanded={open}
          accessibilityLabel={`${open ? 'Hide' : 'Show'} the levels for ${target.label}`}
          onPress={() => setOpen((v) => !v)}
        />
        {own.length > 0 ? (
          <TextLink
            label="Reset All"
            size="sm"
            disabled={reset.isPending}
            accessibilityLabel={`Reset every setting for ${target.label}`}
            onPress={() => {
              setMessage(null)
              void reset
                .run({ ids: own.map((r) => r.id), organizationId: target.scope.organizationId })
                .then((result) => {
                  if (!result.ok) {
                    setMessage('Not every setting could be reset. Try again.')
                  }
                })
            }}
          />
        ) : null}
      </ButtonRow>
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      {others.map((row) => (
        <PreferenceRowLine
          key={row.id}
          row={row}
          title={`${rowSubjectWords(row, names)}: ${LEVEL_LABEL[row.level]}`}
        />
      ))}
      {open ? (
        <KindLevels
          scope={target.scope}
          rows={rows}
          effective={effective.data}
          failed={effective.isError}
          kinds={kinds}
        />
      ) : null}
    </View>
  )
}

/** Project, environment and server overrides inside one organization. */
function ScopeOverrides({
  organizationId,
  rows,
  kinds,
  names,
}: Readonly<{
  organizationId: string
  rows: readonly NotificationPreferenceRow[]
  kinds: readonly SettableNotificationKind[]
  names: PreferenceNames
}>) {
  const projects = useProjects(organizationId)
  const environments = useEnvironments(organizationId)
  const servers = useOrgServers(organizationId)
  const [added, setAdded] = useState<string[]>([])
  // Until all three lists are in, a missing name only means "not loaded yet".
  const listsLoaded = !projects.isLoading && !environments.isLoading && !servers.isLoading

  const targets = useMemo(() => {
    const map = new Map<string, OverrideTarget>()
    const projectNames = new Map<string, string>(
      (projects.data?.projects ?? []).map((p): [string, string] => [
        p.id,
        p.name ?? 'Untitled project',
      ])
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
      label: listsLoaded
        ? `${SCOPE_WORD[s.source]} (deleted or not visible to you)`
        : SCOPE_WORD[s.source],
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
      <Text style={panelStyles.muted}>
        A project or environment override applies only to events that name that project or
        environment. Today&apos;s events name a server or only the organization, so those two wait
        for events that do.
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
            names={names}
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

/** Category, event and channel names from one preference read, for the row words. */
function catalogNames(data: NotificationPreferences | undefined): PreferenceNames {
  return {
    categories: new Map((data?.catalog.categories ?? []).map((c) => [c.code, c.name])),
    topics: new Map((data?.catalog.topics ?? []).map((t) => [t.code, t.name])),
    channels: new Map((data?.channels ?? []).map((c) => [c.id, c.label])),
  }
}

function LoadFailure({
  error,
  where,
}: Readonly<{ error: unknown; where: 'account' | 'organization' }>) {
  const copy = preferencesLoadFailureCopy(error, where)
  return <InlineNotice tone="warning" title={copy.title} body={copy.body} />
}

/** What one person hears from one organization, once its read is in. */
function OrganizationPreferencesBody({
  orgId,
  data,
}: Readonly<{ orgId: string; data: NotificationPreferences }>) {
  // One clock reading per mount: a setting with an end time is judged against it.
  const [nowMs] = useState(() => Date.now())
  const kinds = useMemo(() => availableKinds(data.channels), [data.channels])
  const names = useMemo(() => catalogNames(data), [data])
  const scope = { organizationId: orgId }
  const pictures = categoryPictures({
    rows: data.rows,
    organizationId: orgId,
    categories: data.catalog.categories,
    kinds,
    effective: data.effective,
    nowMs,
  })
  const others = otherRowsAt(data.rows, scope, {
    kinds,
    categories: data.catalog.categories.map((c) => c.code),
  })
  return (
    <>
      {nothingTurnedOn(data, orgId, nowMs) ? (
        <InlineNotice
          tone="warning"
          title="Nothing is turned on"
          body="You will not hear anything from this organization, not even in the bell, until you choose a preset or a level below."
        />
      ) : null}
      <PresetPicker organizationId={orgId} rows={data.rows} presets={data.presets} />
      <KindLevels scope={scope} rows={data.rows} effective={data.effective} kinds={kinds} />
      <CategoryLevels organizationId={orgId} pictures={pictures} names={names} />
      <OtherSettings title="Other Settings Here" rows={others} names={names} />
      <ScopeOverrides organizationId={orgId} rows={data.rows} kinds={kinds} names={names} />
    </>
  )
}

/**
 * Organization Settings › Notifications, "Your Notifications": what this
 * person hears from this organization. Every member can use it.
 */
export function OrganizationNotificationPreferences({ orgId }: Readonly<{ orgId: string }>) {
  const query = useNotificationPreferencesQuery(orgId)
  let body: ReactNode
  if (query.isLoading) body = <LoadingState label="Loading your notification settings…" />
  else if (query.isError || !query.data) {
    body = <LoadFailure error={query.error} where="organization" />
  } else {
    body = <OrganizationPreferencesBody orgId={orgId} data={query.data} />
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

/** Administrators only: hear organizations they do not belong to as well. */
function HearEveryOrganization({ value }: Readonly<{ value: boolean }>) {
  const settings = useUpdateNotificationSettings()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <View style={styles.block}>
      <SettingRow
        label="Hear Every Organization"
        description="As an administrator you only hear the organizations you belong to. Turn this on to hear every organization on this control plane."
      >
        <Toggle
          value={value}
          busy={settings.isPending}
          onValueChange={(next) => {
            setMessage(null)
            void settings.run(next).then((result) => {
              if (!result.ok) setMessage(preferenceErrorCopy(result.cause))
            })
          }}
          accessibilityLabel="Hear Every Organization"
        />
      </SettingRow>
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
    </View>
  )
}

/** Account › Notifications: the levels for every organization, and the administrator switch. */
export function GlobalNotificationPreferences() {
  const query = useNotificationPreferencesQuery(null)
  const data = query.data
  const kinds = useMemo(() => availableKinds(data?.channels ?? []), [data?.channels])
  let body: ReactNode
  if (query.isLoading) body = <LoadingState label="Loading your notification settings…" />
  else if (query.isError || !data) {
    body = <LoadFailure error={query.error} where="account" />
  } else {
    body = (
      <>
        {noLevelsSet(data.effective, kinds) ? (
          <InlineNotice
            tone="warning"
            title="No levels are set for every organization"
            body="Organizations you have set one by one still apply. Choose a preset here to hear every organization you belong to."
          />
        ) : null}
        <PresetPicker organizationId={null} rows={data.rows} presets={data.presets} />
        <KindLevels scope={{}} rows={data.rows} effective={data.effective} kinds={kinds} />
        {data.administrator ? <HearEveryOrganization value={data.allOrganizations} /> : null}
      </>
    )
  }
  return (
    <SectionPanel
      title="Every Organization"
      hint="The levels for every organization you belong to. An organization's own settings win over these."
    >
      <View style={styles.stack}>{body}</View>
    </SectionPanel>
  )
}

/** One organization's rows (or the rows for every organization) in the override list. */
function OverrideGroupBlock({
  group,
  names,
  onOpen,
}: Readonly<{
  group: OverrideGroup
  names: PreferenceNames
  onOpen: (organizationId: string) => void
}>) {
  const organizationId = group.organizationId
  // Names are read only for an organization whose rows name a project,
  // environment or server; the rest cost nothing.
  const needsNames = group.rows.some((r) => r.projectId || r.environmentId || r.serverId)
  const scopeNames = useNotificationScopeNames(organizationId ?? '', { enabled: needsNames })
  const rowNames: PreferenceNames = {
    ...names,
    projects: scopeNames.data?.projects,
    environments: scopeNames.data?.environments,
    servers: scopeNames.data?.servers,
  }
  return (
    <View style={styles.block}>
      <View style={styles.kindHead}>
        <Text style={styles.subheading}>{group.title}</Text>
        {organizationId ? (
          <TextLink
            label="Open Settings"
            size="sm"
            accessibilityLabel={`Open the notification settings of ${group.title}`}
            onPress={() => onOpen(organizationId)}
          />
        ) : null}
      </View>
      {group.rows.map((row) => (
        <PreferenceRowLine
          key={row.id}
          row={row}
          title={`${rowScopeWords(row, rowNames)}: ${LEVEL_LABEL[row.level]}`}
          detail={rowSubjectWords(row, rowNames)}
        />
      ))}
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
  const names: PreferenceNames = {
    ...catalogNames(globalQuery.data),
    organizations: organizationNames,
  }
  const loading = globalQuery.isLoading || orgQueries.some((q) => q.isLoading)
  const failedRead = globalQuery.isError ? globalQuery : orgQueries.find((q) => q.isError)

  let body: ReactNode
  if (loading) body = <LoadingState label="Loading your overrides…" />
  else {
    // A read that failed is said, never passed off as "nothing set".
    body = (
      <>
        {failedRead ? (
          <>
            <LoadFailure error={failedRead.error} where="account" />
            {groups.length > 0 ? (
              <Text style={panelStyles.muted}>The list below may be incomplete.</Text>
            ) : null}
          </>
        ) : null}
        {groups.length === 0 && !failedRead ? (
          <Text style={panelStyles.muted}>You have not set anything yet.</Text>
        ) : null}
        {groups.map((group) => (
          <OverrideGroupBlock
            key={group.organizationId ?? 'every-organization'}
            group={group}
            names={names}
            onOpen={(organizationId) =>
              router.push(orgSettingsTabHref(organizationId, 'notifications') as Href)
            }
          />
        ))}
      </>
    )
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
})
