import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { ScreenSafeArea } from '@/components/screen-safe-area'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  EmptyState,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
  TextField,
  TextLink,
  Toggle,
  TypeNameDeleteButton,
  type SegmentedOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  NOTIFICATION_CHANNEL_KINDS,
  type NotificationChannel,
  type NotificationChannelKind,
  type NotificationEventInfo,
  type NotificationSeverity,
} from '@/lib/instance-api'
import { notificationEventChoiceLabel } from '@/lib/notification-event-choice'
import {
  addressHint,
  addressFieldLabel,
  channelAwaitsConfirmation,
  channelErrorCopy,
  channelVerifiedBanner,
  confirmationSentCopy,
  DIGEST_OPTIONS,
  draftFromRules,
  KIND_LABEL,
  organizationChannelEvents,
  QUIET_TIME_OPTIONS,
  quietWindowValid,
  rulesFromDraft,
  type RulesDraft,
  timingDraftFromChannel,
  timingPatch,
  channelHasTiming,
  timingSummary,
  type TimingDraft,
} from '@/lib/notification-channels'
import { useTimezones } from '@/lib/queries/servers'
import {
  useCreateNotificationChannel,
  useDeleteNotificationChannel,
  useNotificationChannelsQuery,
  useNotificationEventsQuery,
  useResendChannelVerification,
  useUpdateNotificationChannel,
} from '@/lib/queries/notifications'
import {
  GlobalNotificationPreferences,
  NotificationOverridesList,
  OrganizationNotificationPreferences,
} from '@/components/account/notification-preferences-section'
import { preferencesRoutesAbsent } from '@/lib/notification-preferences'
import { orgSettingsTabHref } from '@/lib/org-navigation'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { useNotificationPreferencesQuery } from '@/lib/queries/notification-preferences'
import { colors, spacing, webPointer } from '@/lib/theme'

const KIND_OPTIONS: readonly SegmentedOption<NotificationChannelKind>[] =
  NOTIFICATION_CHANNEL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))

const SEVERITY_OPTIONS: readonly SegmentedOption<NotificationSeverity>[] = [
  { value: 'info', label: 'All' },
  { value: 'warning', label: 'Warnings and Critical' },
  { value: 'critical', label: 'Critical Only' },
]

function RulesEditor({
  events,
  draft,
  onChange,
  disabled,
}: Readonly<{
  events: readonly NotificationEventInfo[]
  draft: RulesDraft
  onChange: (next: RulesDraft) => void
  disabled?: boolean
}>) {
  return (
    <View style={styles.rules}>
      <Toggle
        value={draft.everything}
        onValueChange={(everything) => onChange({ ...draft, everything })}
        onLabel="Every event"
        offLabel="Chosen events"
        disabled={disabled}
        accessibilityLabel="Deliver every event"
      />
      <SegmentedControl
        options={SEVERITY_OPTIONS}
        value={draft.floor}
        onChange={(floor) => onChange({ ...draft, floor })}
        disabled={disabled}
        accessibilityLabel="Minimum severity"
      />
      {draft.everything ? null : (
        <View style={styles.eventList}>
          {events.map((info) => (
            <Checkbox
              key={info.event}
              checked={draft.events.has(info.event)}
              disabled={disabled}
              label={notificationEventChoiceLabel(info)}
              onPress={() => {
                const next = new Set(draft.events)
                if (next.has(info.event)) next.delete(info.event)
                else next.add(info.event)
                onChange({ ...draft, events: next })
              }}
            />
          ))}
        </View>
      )}
    </View>
  )
}

/**
 * Delivery timing for a channel: a digest instead of one message per
 * event, and quiet hours. Urgent events (outages, security) are never held.
 * The zone is the person's own for a personal channel; an organization
 * channel is read in the organization's zone.
 */
function TimingEditor({
  channel,
  draft,
  onChange,
  disabled,
}: Readonly<{
  channel: NotificationChannel
  draft: TimingDraft
  onChange: (next: TimingDraft) => void
  disabled?: boolean
}>) {
  const personal = channel.scope === 'user'
  const zones = useTimezones({ enabled: personal })
  const zoneOptions = useMemo(
    () =>
      [...(zones.data?.timezones ?? [])]
        .sort((a, b) => a.localeCompare(b))
        .map((tz) => ({ value: tz, label: tz })),
    [zones.data]
  )
  return (
    <View style={styles.rules}>
      <Text style={panelStyles.muted}>
        Outages and security changes always arrive at once, whatever you choose here.
      </Text>
      <SegmentedControl
        options={DIGEST_OPTIONS}
        value={draft.digest}
        onChange={(digest) => onChange({ ...draft, digest })}
        disabled={disabled}
        accessibilityLabel="Digest"
      />
      <Toggle
        value={draft.quietOn}
        onValueChange={(quietOn) => onChange({ ...draft, quietOn })}
        onLabel="Quiet hours on"
        offLabel="No quiet hours"
        disabled={disabled}
        accessibilityLabel="Quiet hours"
      />
      {draft.quietOn ? (
        <View style={styles.eventList}>
          <Select
            value={draft.start}
            options={QUIET_TIME_OPTIONS}
            placeholder="Start"
            disabled={disabled}
            mono
            accessibilityLabel="Quiet hours start"
            onChange={(start) => onChange({ ...draft, start: start ?? draft.start })}
          />
          <Select
            value={draft.end}
            options={QUIET_TIME_OPTIONS}
            placeholder="End"
            disabled={disabled}
            mono
            accessibilityLabel="Quiet hours end"
            onChange={(end) => onChange({ ...draft, end: end ?? draft.end })}
          />
          {quietWindowValid(draft) ? null : (
            <Text style={panelStyles.error}>The start and the end cannot be the same time.</Text>
          )}
          <Text style={panelStyles.muted}>
            Events that arrive in this window are sent as one summary when it ends.
          </Text>
        </View>
      ) : null}
      {personal ? (
        <Select
          value={draft.timeZone}
          options={zoneOptions}
          placeholder="Time zone"
          noneLabel="UTC"
          disabled={disabled}
          mono
          searchPlaceholder="Filter timezones"
          accessibilityLabel="Time zone"
          onChange={(timeZone) => onChange({ ...draft, timeZone })}
        />
      ) : (
        <Text style={panelStyles.muted}>
          Read in {channel.timeZone}, the organization&apos;s time zone.
        </Text>
      )}
    </View>
  )
}

function LastDelivery({
  delivery,
}: Readonly<{ delivery: NotificationChannel['recentDeliveries'][number] | undefined }>) {
  if (!delivery) return <Text style={panelStyles.muted}>No deliveries in the last week.</Text>
  const attempts = delivery.attempts > 1 ? ` after ${delivery.attempts} attempts` : ''
  return (
    <Text style={panelStyles.muted}>
      Last delivery: {delivery.status}
      {attempts} · {delivery.event}
    </Text>
  )
}

/** A channel's name, badges, address, timing summary and last delivery. */
function ChannelHead({ channel }: Readonly<{ channel: NotificationChannel }>) {
  const primary = channel.isPrimary === true
  const disabled = channel.disabledAt !== null
  const awaitingConfirmation = channelAwaitsConfirmation(channel)
  const summary = channelHasTiming(channel) ? timingSummary(channel) : null
  const lastDelivery = channel.recentDeliveries[0]
  return (
    <View style={styles.channelHead}>
      <View style={styles.channelTitle}>
        <Text style={styles.channelLabel}>{channel.label}</Text>
        {primary ? <Badge tone="info" label="Account Email" /> : null}
        <Badge
          tone={disabled ? 'muted' : 'ok'}
          label={KIND_LABEL[channel.kind as NotificationChannelKind] ?? channel.kind}
        />
        {channel.signed ? <Badge tone="info" label="Signed" /> : null}
        {disabled ? <Badge tone="pending" label="Paused" /> : null}
        {awaitingConfirmation ? <Badge tone="pending" label="Awaiting Confirmation" /> : null}
      </View>
      <Text style={panelStyles.muted}>{channel.address}</Text>
      {summary ? <Text style={panelStyles.muted}>{summary}</Text> : null}
      {awaitingConfirmation ? (
        <Text style={panelStyles.muted}>
          Nothing is sent to this address until the confirmation link in the email is opened.
        </Text>
      ) : null}
      {primary ? (
        <Text style={panelStyles.muted}>
          Built in: it follows your sign-in address and cannot be removed.
        </Text>
      ) : null}
      <LastDelivery delivery={lastDelivery} />
    </View>
  )
}

function ChannelRow({
  channel,
  events,
  scope,
  hasRules,
  organizationId,
}: Readonly<{
  channel: NotificationChannel
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
  /** The channel is routed by its own rules, not by the person's notification settings. */
  hasRules: boolean
  organizationId: string | null
}>) {
  const update = useUpdateNotificationChannel(scope, organizationId)
  const remove = useDeleteNotificationChannel(scope, organizationId)
  const resend = useResendChannelVerification(organizationId)
  const awaitingConfirmation = channelAwaitsConfirmation(channel)
  const primary = channel.isPrimary === true
  const [draft, setDraft] = useState(() => draftFromRules(channel.rules))
  const [dirty, setDirty] = useState(false)
  const [timing, setTiming] = useState(() => timingDraftFromChannel(channel))
  const [timingDirty, setTimingDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [sentNote, setSentNote] = useState<string | null>(null)
  const disabled = channel.disabledAt !== null
  const hasTiming = channelHasTiming(channel)

  const onTiming = useCallback((next: TimingDraft) => {
    setTiming(next)
    setTimingDirty(true)
  }, [])

  const saveTiming = useCallback(() => {
    setMessage(null)
    void update.run({ id: channel.id, ...timingPatch(timing, channel) }).then((result) => {
      if (result.ok) setTimingDirty(false)
      else setMessage(channelErrorCopy(result.error))
    })
  }, [channel, timing, update])

  const onDraft = useCallback((next: RulesDraft) => {
    setDraft(next)
    setDirty(true)
  }, [])

  const save = useCallback(() => {
    setMessage(null)
    void update.run({ id: channel.id, rules: rulesFromDraft(draft) }).then((result) => {
      if (result.ok) setDirty(false)
      else setMessage(channelErrorCopy(result.error))
    })
  }, [channel.id, draft, update])

  const sendAgain = useCallback(() => {
    setMessage(null)
    setSentNote(null)
    void resend.run(channel.id).then((result) => {
      if (result.ok) setSentNote('Confirmation link sent again.')
      else setMessage(channelErrorCopy(result.error))
    })
  }, [channel.id, resend])

  return (
    <View style={styles.channel}>
      <ChannelHead channel={channel} />
      {hasRules ? (
        <RulesEditor events={events} draft={draft} onChange={onDraft} disabled={update.isPending} />
      ) : null}
      {hasTiming ? (
        <TimingEditor
          channel={channel}
          draft={timing}
          onChange={onTiming}
          disabled={update.isPending}
        />
      ) : null}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      {sentNote ? <Text style={panelStyles.muted}>{sentNote}</Text> : null}
      <ButtonRow>
        {awaitingConfirmation ? (
          <Button
            label="Send Again"
            onPress={sendAgain}
            busy={resend.isPending}
            busyLabel="Sending…"
          />
        ) : null}
        {hasRules ? (
          <Button
            label="Save Rules"
            variant="primary"
            busy={update.isPending}
            disabled={!dirty}
            onPress={save}
          />
        ) : null}
        {hasTiming ? (
          <Button
            label="Save Timing"
            variant="primary"
            busy={update.isPending}
            disabled={!timingDirty || !quietWindowValid(timing)}
            onPress={saveTiming}
          />
        ) : null}
        <Button
          label={disabled ? 'Resume' : 'Pause'}
          onPress={() => void update.run({ id: channel.id, disabled: !disabled })}
          busy={update.isPending}
        />
        {primary ? null : (
          <TypeNameDeleteButton
            label="Remove"
            thing="Channel"
            verb="Remove"
            name={channel.label}
            description={hasRules ? 'Its rules go with it.' : 'Nothing is sent to it again.'}
            busy={remove.isPending}
            onConfirm={() => remove.run(channel.id)}
          />
        )}
      </ButtonRow>
    </View>
  )
}

function AddChannelForm({
  events,
  scope,
  hasRules,
  organizationId,
}: Readonly<{
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
  hasRules: boolean
  organizationId: string | null
}>) {
  const create = useCreateNotificationChannel(scope, organizationId)
  const [kind, setKind] = useState<NotificationChannelKind>('email')
  const [label, setLabel] = useState('')
  const [address, setAddress] = useState('')
  const [signingSecret, setSigningSecret] = useState('')
  const [draft, setDraft] = useState<RulesDraft>({
    everything: true,
    floor: 'warning',
    events: new Set(),
  })
  const [message, setMessage] = useState<string | null>(null)
  const [sentNote, setSentNote] = useState<string | null>(null)

  const onAdd = useCallback(() => {
    setMessage(null)
    setSentNote(null)
    const typedAddress = address.trim()
    void create
      .run({
        kind,
        label: label.trim(),
        address: address.trim(),
        ...(kind === 'webhook' && signingSecret ? { signingSecret } : {}),
        ...(hasRules ? { rules: rulesFromDraft(draft) } : {}),
      })
      .then((result) => {
        if (result.ok) {
          if (channelAwaitsConfirmation(result.value))
            setSentNote(confirmationSentCopy(typedAddress))
          setLabel('')
          setAddress('')
          setSigningSecret('')
        } else {
          setMessage(channelErrorCopy(result.error))
        }
      })
  }, [address, create, draft, hasRules, kind, label, signingSecret])

  return (
    <View style={styles.addCard}>
      <SegmentedControl
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
        accessibilityLabel="Channel kind"
      />
      <TextField
        label="Name"
        hint="How this channel is listed — “Ops Slack”, “my phone”."
        value={label}
        onChangeText={setLabel}
        editable={!create.isPending}
      />
      <TextField
        label={addressFieldLabel(kind)}
        hint={addressHint(kind)}
        value={address}
        onChangeText={setAddress}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={kind !== 'email'}
        editable={!create.isPending}
      />
      {kind === 'webhook' ? (
        <TextField
          label="Signing secret (optional)"
          hint="Shared with the receiver; each delivery carries sha256=… over the raw body in X-TurboPanel-Signature."
          value={signingSecret}
          onChangeText={setSigningSecret}
          autoCapitalize="none"
          secureTextEntry
          editable={!create.isPending}
        />
      ) : null}
      {hasRules ? (
        <RulesEditor
          events={events}
          draft={draft}
          onChange={setDraft}
          disabled={create.isPending}
        />
      ) : (
        <Text style={panelStyles.muted}>
          What reaches this channel follows your notification settings above.
        </Text>
      )}
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      {sentNote ? <Text style={panelStyles.muted}>{sentNote}</Text> : null}
      <ButtonRow>
        <Button
          label="Add Channel"
          variant="primary"
          busy={create.isPending}
          busyLabel="Adding…"
          disabled={label.trim().length === 0 || address.trim().length === 0}
          onPress={onAdd}
        />
      </ButtonRow>
    </View>
  )
}

function ChannelsList({
  isLoading,
  isError,
  forbidden,
  channels,
  events,
  scope,
  hasRules,
  organizationId,
}: Readonly<{
  isLoading: boolean
  isError: boolean
  forbidden: boolean
  channels: readonly NotificationChannel[]
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
  hasRules: boolean
  organizationId: string | null
}>) {
  if (isLoading) return <LoadingState label="Loading channels…" />
  if (forbidden) {
    return (
      <Text style={panelStyles.muted}>
        Only the organization&apos;s owners and managers can see and change its shared channels.
        Your own notifications are set above.
      </Text>
    )
  }
  if (isError) {
    return (
      <InlineNotice
        tone="warning"
        title="Could not load channels"
        body="Reload the page to try again."
      />
    )
  }
  if (channels.length === 0) return <EmptyState title="No channels yet." />
  return channels.map((channel) => (
    <ChannelRow
      key={channel.id}
      channel={channel}
      events={events}
      scope={scope}
      hasRules={hasRules}
      organizationId={organizationId}
    />
  ))
}

function ChannelsPanel({
  scope,
  events,
  organizationId,
}: Readonly<{
  scope: 'user' | 'organization'
  events: readonly NotificationEventInfo[]
  organizationId: string | null
}>) {
  const query = useNotificationChannelsQuery(scope, { organizationId })
  const forbidden = query.data === null
  // An organization channel is routed by its rules. A personal channel
  // follows the person's notification settings, unless the control plane
  // predates those settings (its preference read answers 404): there a
  // personal channel is still routed by rules and one created without any
  // would receive nothing, so the rules editor stays for it.
  const personal = scope === 'user'
  const settings = useNotificationPreferencesQuery(null, { enabled: personal })
  const settingsAbsent = personal && preferencesRoutesAbsent(settings.error)
  const hasRules = !personal || settingsAbsent
  const allEvents = useNotificationEventsQuery({ enabled: settingsAbsent })
  const ruleEvents = settingsAbsent ? (allEvents.data ?? []) : events
  // Until the settings read answers, it is not known which of the two a new
  // personal channel needs, so the add form waits for it.
  const undecided = personal && settings.isLoading
  // The built-in Account Email channel always comes first.
  const channels = [...(query.data ?? [])].sort(
    (a, b) => Number(b.isPrimary === true) - Number(a.isPrimary === true)
  )
  return (
    <View style={styles.stack}>
      <ChannelsList
        isLoading={query.isLoading}
        isError={query.isError}
        forbidden={forbidden}
        channels={channels}
        events={ruleEvents}
        scope={scope}
        hasRules={hasRules}
        organizationId={organizationId}
      />
      {settingsAbsent ? (
        <Text style={panelStyles.muted}>
          This control plane is older than this web interface: each of your channels is sent what
          its own rules choose.
        </Text>
      ) : null}
      {forbidden || query.isLoading || undecided ? null : (
        <AddChannelForm
          events={ruleEvents}
          scope={scope}
          hasRules={hasRules}
          organizationId={organizationId}
        />
      )}
    </View>
  )
}

/**
 * Organization Settings › Notifications. First what this person hears from
 * the organization (every member), then the organization's shared channels,
 * which only its owners and managers manage; anyone else sees a sentence.
 */
export function OrganizationChannelsSection({ orgId }: Readonly<{ orgId: string }>) {
  const router = useRouter()
  const eventsQuery = useNotificationEventsQuery()
  const events = useMemo(
    () => organizationChannelEvents(eventsQuery.data ?? []),
    [eventsQuery.data]
  )
  return (
    <View style={styles.tab}>
      <OrganizationNotificationPreferences orgId={orgId} />
      <SectionPanel
        title="Organization Channels"
        hint="Shared by the organization, such as a team chat room; owners and managers edit them and choose their events."
      >
        <ChannelsPanel scope="organization" events={events} organizationId={orgId} />
      </SectionPanel>
      <SectionPanel
        title="Your Channels"
        hint="Your own email, chat and webhook channels follow your account across organizations."
      >
        <TextLink
          label="Open Your Notification Settings"
          onPress={() => router.push('/account/notifications')}
        />
      </SectionPanel>
    </View>
  )
}

/** Each organization the person belongs to, with a link to its Notifications tab. */
function OrganizationSettingsLinks() {
  const router = useRouter()
  const organizationsQuery = useOrganizationsQuery()
  const organizations = organizationsQuery.data?.organizations ?? []
  if (organizations.length === 0) return null
  return (
    <SectionPanel
      title="Organization Notifications"
      hint="Set what you hear from one organization, by project, environment and server, on its own settings page."
    >
      <View style={styles.eventList}>
        {organizations.map((organization) => (
          <TextLink
            key={organization.id}
            label={organization.name ?? 'Untitled organization'}
            accessibilityLabel={`Open the notification settings of ${organization.name ?? 'this organization'}`}
            onPress={() =>
              router.push(orgSettingsTabHref(organization.id, 'notifications') as Href)
            }
          />
        ))}
      </View>
    </SectionPanel>
  )
}

export function NotificationChannelsSectionContent() {
  const router = useRouter()
  // The confirmation link redirects here with `?channelVerified=1|0`.
  const verifiedBanner = channelVerifiedBanner(
    useLocalSearchParams<{ channelVerified?: string }>().channelVerified
  )

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <Pressable
        onPress={() => {
          if (router.canGoBack()) {
            router.back()
            return
          }
          router.replace('/')
        }}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={({ pressed }) => [styles.back, pressed && styles.backPressed, webPointer]}
      >
        <Text style={styles.backLabel}>Back</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={panelStyles.pageEyebrow}>Account</Text>
        <Text style={panelStyles.pageTitle}>Notifications</Text>
        <Text style={panelStyles.pageCopy}>
          Nothing reaches you until you turn it on. Pick a preset to start, then fine-tune by
          channel, organization, project or server. Your own channels below decide where it goes
          besides the bell.
        </Text>
      </View>

      {verifiedBanner ? (
        <InlineNotice
          tone={verifiedBanner.tone}
          title={verifiedBanner.title}
          body={verifiedBanner.body}
        />
      ) : null}

      <GlobalNotificationPreferences />
      <OrganizationSettingsLinks />
      <NotificationOverridesList />

      <SectionPanel
        title="Your Channels"
        hint="Yours alone; they follow your account across organizations. Your notification settings decide what each receives; digest and quiet hours are set per channel."
      >
        <ChannelsPanel scope="user" events={[]} organizationId={null} />
      </SectionPanel>
    </ScrollView>
  )
}

export function NotificationChannelsSection() {
  return (
    <ScreenSafeArea>
      <NotificationChannelsSectionContent />
    </ScreenSafeArea>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
  },
  page: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.md,
  },
  backPressed: {
    opacity: 0.7,
  },
  backLabel: {
    color: colors.textBody,
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    gap: spacing.xs,
  },
  tab: {
    width: '100%',
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.md,
  },
  channel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 10,
  },
  channelHead: {
    gap: 4,
  },
  channelTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  channelLabel: {
    color: colors.textTitle,
    fontSize: 15,
    fontWeight: '600',
  },
  rules: {
    gap: spacing.sm,
  },
  eventList: {
    gap: 6,
  },
  addCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderMuted,
    borderRadius: 10,
  },
})
