import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenSafeArea } from '@/components/screen-safe-area'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  type SegmentedOption,
  TextField,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  NOTIFICATION_CHANNEL_KINDS,
  type NotificationChannel,
  type NotificationChannelKind,
  type NotificationEventInfo,
  type NotificationSeverity,
} from '@/lib/instance-api'
import {
  addressHint,
  addressFieldLabel,
  channelErrorCopy,
  draftFromRules,
  KIND_LABEL,
  rulesFromDraft,
  type RulesDraft,
} from '@/lib/notification-channels'
import {
  useCreateNotificationChannel,
  useDeleteNotificationChannel,
  useNotificationChannelsQuery,
  useNotificationEventsQuery,
  useUpdateNotificationChannel,
} from '@/lib/queries/notifications'
import { getActiveOrganizationId, resolvePreferredOrganizationId } from '@/lib/org-context'
import { useOrganizationsQuery } from '@/lib/queries/auth'
import { colors, spacing, webPointer } from '@/lib/theme'

const KIND_OPTIONS: readonly SegmentedOption<NotificationChannelKind>[] =
  NOTIFICATION_CHANNEL_KINDS.map((value) => ({ value, label: KIND_LABEL[value] }))

const SEVERITY_OPTIONS: readonly SegmentedOption<NotificationSeverity>[] = [
  { value: 'info', label: 'Everything' },
  { value: 'warning', label: 'Warnings and up' },
  { value: 'critical', label: 'Critical only' },
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
      {draft.everything ? (
        <SegmentedControl
          options={SEVERITY_OPTIONS}
          value={draft.floor}
          onChange={(floor) => onChange({ ...draft, floor })}
          disabled={disabled}
          accessibilityLabel="Minimum severity"
        />
      ) : (
        <View style={styles.eventList}>
          {events.map((info) => (
            <Checkbox
              key={info.event}
              checked={draft.events.has(info.event)}
              disabled={disabled}
              label={`${info.example} · ${info.event}`}
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

function ChannelRow({
  channel,
  events,
  scope,
  organizationId,
}: Readonly<{
  channel: NotificationChannel
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
  organizationId: string | null
}>) {
  const update = useUpdateNotificationChannel(scope, organizationId)
  const remove = useDeleteNotificationChannel(scope, organizationId)
  const [draft, setDraft] = useState(() => draftFromRules(channel.rules))
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const disabled = channel.disabledAt !== null
  const lastDelivery = channel.recentDeliveries[0]

  const onDraft = useCallback((next: RulesDraft) => {
    setDraft(next)
    setDirty(true)
  }, [])

  const save = useCallback(() => {
    setMessage(null)
    void update
      .run({ id: channel.id, rules: rulesFromDraft(draft) })
      .then((result) => {
        if (result.ok) setDirty(false)
        else setMessage(channelErrorCopy(result.error))
      })
  }, [channel.id, draft, update])

  return (
    <View style={styles.channel}>
      <View style={styles.channelHead}>
        <View style={styles.channelTitle}>
          <Text style={styles.channelLabel}>{channel.label}</Text>
          <Badge tone={disabled ? 'muted' : 'ok'} label={KIND_LABEL[channel.kind as NotificationChannelKind] ?? channel.kind} />
          {channel.signed ? <Badge tone="info" label="Signed" /> : null}
          {disabled ? <Badge tone="pending" label="Paused" /> : null}
        </View>
        <Text style={panelStyles.muted}>{channel.address}</Text>
        {lastDelivery ? (
          <Text style={panelStyles.muted}>
            Last delivery: {lastDelivery.status}
            {lastDelivery.attempts > 1 ? ` after ${lastDelivery.attempts} attempts` : ''} · {lastDelivery.event}
          </Text>
        ) : (
          <Text style={panelStyles.muted}>No deliveries in the last week.</Text>
        )}
      </View>
      <RulesEditor events={events} draft={draft} onChange={onDraft} disabled={update.isPending} />
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      <ButtonRow>
        <Button
          label="Save rules"
          variant="primary"
          busy={update.isPending}
          disabled={!dirty}
          onPress={save}
        />
        <Button
          label={disabled ? 'Resume' : 'Pause'}
          onPress={() => void update.run({ id: channel.id, disabled: !disabled })}
          busy={update.isPending}
        />
        <ConfirmButton
          label="Remove"
          confirmLabel="Remove channel"
          prompt="Remove this channel? Its rules go with it."
          busy={remove.isPending}
          onConfirm={() => void remove.run(channel.id)}
        />
      </ButtonRow>
    </View>
  )
}

function AddChannelForm({
  events,
  scope,
  organizationId,
}: Readonly<{
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
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

  const onAdd = useCallback(() => {
    setMessage(null)
    void create
      .run({
        kind,
        label: label.trim(),
        address: address.trim(),
        ...(kind === 'webhook' && signingSecret ? { signingSecret } : {}),
        rules: rulesFromDraft(draft),
      })
      .then((result) => {
        if (result.ok) {
          setLabel('')
          setAddress('')
          setSigningSecret('')
        } else {
          setMessage(channelErrorCopy(result.error))
        }
      })
  }, [address, create, draft, kind, label, signingSecret])

  return (
    <View style={styles.addCard}>
      <SegmentedControl options={KIND_OPTIONS} value={kind} onChange={setKind} accessibilityLabel="Channel kind" />
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
      <RulesEditor events={events} draft={draft} onChange={setDraft} disabled={create.isPending} />
      {message ? <Text style={panelStyles.error}>{message}</Text> : null}
      <ButtonRow>
        <Button
          label="Add channel"
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
  channels,
  events,
  scope,
  organizationId,
}: Readonly<{
  isLoading: boolean
  isError: boolean
  channels: readonly NotificationChannel[]
  events: readonly NotificationEventInfo[]
  scope: 'user' | 'organization'
  organizationId: string | null
}>) {
  if (isLoading) return <LoadingState label="Loading channels…" />
  if (isError) {
    return <InlineNotice tone="warning" title="Could not load channels" body="Reload the page to try again." />
  }
  if (channels.length === 0) return <EmptyState title="No channels yet." />
  return channels.map((channel) => (
    <ChannelRow key={channel.id} channel={channel} events={events} scope={scope} organizationId={organizationId} />
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
  const channels = query.data ?? []
  return (
    <View style={styles.stack}>
      <ChannelsList
        isLoading={query.isLoading}
        isError={query.isError}
        channels={channels}
        events={events}
        scope={scope}
        organizationId={organizationId}
      />
      <AddChannelForm events={events} scope={scope} organizationId={organizationId} />
    </View>
  )
}

/**
 * Account → Notifications: where a person decides what leaves the console
 * and how. The inbox (the bell) needs nothing here; channels do. Personal
 * channels are the signed-in person's own; organization channels belong to
 * the organization in context and need a manager.
 */
export function NotificationChannelsSectionContent() {
  const router = useRouter()
  const eventsQuery = useNotificationEventsQuery()
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data])
  // This screen sits outside the org shell, so the active organization may be
  // unset; the person's preferred one (stored, or their only one) stands in.
  const organizationsQuery = useOrganizationsQuery()
  const organizationId = useMemo(() => {
    const organizations = organizationsQuery.data?.organizations ?? []
    return getActiveOrganizationId() ?? resolvePreferredOrganizationId(organizations)
  }, [organizationsQuery.data])
  const organizationName = organizationsQuery.data?.organizations.find((o) => o.id === organizationId)?.name ?? null

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
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
          Everything that happens in your organizations lands in the bell. Add a channel to be
          told somewhere else too — an email, a chat room, a webhook — and choose which events
          reach it.
        </Text>
      </View>

      <SectionPanel title="Your channels" hint="Yours alone; they follow your account across organizations.">
        <ChannelsPanel scope="user" events={events} organizationId={null} />
      </SectionPanel>

      <SectionPanel
        title="Organization channels"
        hint={organizationName ? `Shared by ${organizationName}; managers may edit them.` : 'Shared by an organization; managers may edit them.'}
      >
        {organizationId ? (
          <ChannelsPanel scope="organization" events={events} organizationId={organizationId} />
        ) : (
          <Text style={panelStyles.muted}>Open an organization first, then come back here.</Text>
        )}
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
