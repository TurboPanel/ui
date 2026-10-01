import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ButtonRow,
  EmptyState,
  InlineNotice,
  LoadingState,
  MonoText,
  SectionPanel,
  SegmentedControl,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import {
  FIREWALL_MODE_OPTIONS,
  firewallBanner,
  firewallErrorMessage,
  firewallModeChoiceText,
  firewallModeLabel,
  firewallModeNote,
  firewallPreviewBadge,
  firewallPreviewFacts,
  shortDigest,
  type FirewallPreviewFacts,
} from '@/lib/firewall'
import type { FirewallMode, FirewallPreview, FirewallServerView } from '@/lib/instance-api'
import { useFirewallServer, useSetFirewallMode } from '@/lib/queries/firewall'
import { colors, spacing } from '@/lib/theme'

const MANAGER_ONLY = 'Only organization owners and managers can see or change a server’s firewall.'

function ModePanel({
  orgId,
  serverId,
  view,
  facts,
}: Readonly<{
  orgId: string
  serverId: string
  view: FirewallServerView
  facts: FirewallPreviewFacts
}>) {
  const mutation = useSetFirewallMode(orgId, serverId)
  const [choice, setChoice] = useState<FirewallMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = view.bulwark.mode

  const confirm = async (mode: FirewallMode) => {
    setError(null)
    try {
      await mutation.mutateAsync(mode)
      setChoice(null)
    } catch (err) {
      setError(firewallErrorMessage(err, 'Failed to change the firewall mode'))
    }
  }

  return (
    <SectionPanel title="Mode" hint="What this server’s firewall is meant to do">
      <SegmentedControl
        options={FIREWALL_MODE_OPTIONS}
        value={choice ?? current}
        disabled={mutation.isPending}
        accessibilityLabel="Firewall mode"
        onChange={(mode) => {
          setError(null)
          setChoice(mode === current ? null : mode)
        }}
      />
      <Text style={panelStyles.muted}>{firewallModeNote(current, facts)}</Text>
      {choice ? (
        <View style={styles.choice}>
          <Text style={styles.choiceText}>{firewallModeChoiceText(choice)}</Text>
          <ButtonRow>
            <Button
              label={`Switch to ${firewallModeLabel(choice)}`}
              busyLabel="Saving…"
              variant="primary"
              size="sm"
              busy={mutation.isPending}
              onPress={() => {
                void confirm(choice)
              }}
            />
            <Button
              label="Cancel"
              size="sm"
              disabled={mutation.isPending}
              onPress={() => setChoice(null)}
            />
          </ButtonRow>
        </View>
      ) : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </SectionPanel>
  )
}

function KernelVerdict({
  facts,
  previewed,
}: Readonly<{ facts: FirewallPreviewFacts; previewed: boolean }>) {
  if (!facts.validation) {
    if (!previewed) return null
    return <Text style={panelStyles.muted}>The server did not report a kernel check.</Text>
  }
  const { ok, errors } = facts.validation
  return (
    <View style={styles.block}>
      <View style={styles.inline}>
        <Text style={styles.label}>Kernel check</Text>
        <Badge tone={ok ? 'ok' : 'danger'} label={ok ? 'Accepted' : 'Would be refused'} />
      </View>
      <Text style={panelStyles.muted}>
        The server asked its firewall to check these rules (nothing was loaded).
      </Text>
      {errors.map((line) => (
        <MonoText key={line} style={styles.errorLine}>
          {line}
        </MonoText>
      ))}
    </View>
  )
}

function BulletList({ title, lines }: Readonly<{ title: string; lines: readonly string[] }>) {
  if (lines.length === 0) return null
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{title}</Text>
      {lines.map((line) => (
        <Text key={line} style={styles.line}>
          • {line}
        </Text>
      ))}
    </View>
  )
}

function CodeBlock({ title, text }: Readonly<{ title: string; text: string }>) {
  return (
    <SectionPanel title={title} collapsible defaultCollapsed>
      <ScrollView horizontal style={styles.code}>
        <MonoText selectable>{text}</MonoText>
      </ScrollView>
    </SectionPanel>
  )
}

function RenderedRuleset({
  facts,
  previewed,
}: Readonly<{ facts: FirewallPreviewFacts; previewed: boolean }>) {
  if (!facts.rendered) {
    if (!previewed) return null
    return (
      <Text style={panelStyles.muted}>
        The ruleset text was left out of the server’s answer (it is too large); the count and digest
        above still describe it.
      </Text>
    )
  }
  return (
    <View style={styles.block}>
      <CodeBlock title="Rendered ruleset (IPv4)" text={facts.rendered.v4} />
      {facts.rendered.v6 ? (
        <CodeBlock title="Rendered ruleset (IPv6)" text={facts.rendered.v6} />
      ) : null}
    </View>
  )
}

function PreviewDetails({ preview }: Readonly<{ preview: FirewallPreview }>) {
  const facts = firewallPreviewFacts(preview)
  const badge = firewallPreviewBadge(preview.status)
  const previewed = preview.status === 'previewed' || preview.status === 'refused'
  return (
    <View style={styles.block}>
      <View style={styles.inline}>
        <Badge tone={badge.tone} label={badge.label} />
        <Text style={panelStyles.muted}>Sent {formatLocalDateTime(preview.sentAt)}</Text>
      </View>
      <Text style={styles.line}>
        Version {preview.generation} · {preview.ruleCount}{' '}
        {preview.ruleCount === 1 ? 'rule' : 'rules'}
      </Text>
      <View style={styles.inline}>
        <Text style={styles.label}>Digest</Text>
        <MonoText>{shortDigest(preview.desiredDigest)}</MonoText>
      </View>
      {facts.summary ? <Text style={panelStyles.muted}>{facts.summary}</Text> : null}
      <KernelVerdict facts={facts} previewed={previewed} />
      <BulletList title="What could not be worked out" lines={preview.notes} />
      <BulletList title="The server also said" lines={facts.warnings} />
      <RenderedRuleset facts={facts} previewed={previewed} />
    </View>
  )
}

/**
 * A server’s firewall as a PREVIEW: the mode it is set to, and the ruleset the
 * control plane last sent it to render and check. Nothing here applies rules
 * to the server. Owners and managers only; the API refuses everyone else.
 */
export function ServerFirewallSection({
  orgId,
  serverId,
  canManage,
}: Readonly<{ orgId: string; serverId: string; canManage: boolean }>) {
  const query = useFirewallServer(orgId, serverId, { enabled: canManage })

  if (!canManage) {
    return (
      <SectionPanel title="Firewall">
        <Text style={panelStyles.muted}>{MANAGER_ONLY}</Text>
      </SectionPanel>
    )
  }
  if (query.isLoading) return <LoadingState label="Loading the firewall…" />
  if (query.error || !query.data) {
    return (
      <Text style={panelStyles.error}>
        {firewallErrorMessage(query.error, 'Failed to load the firewall')}
      </Text>
    )
  }

  const view = query.data
  const facts = firewallPreviewFacts(view.preview)
  const banner = firewallBanner(view.bulwark)

  return (
    <View style={styles.root}>
      <InlineNotice tone={banner.tone} title={banner.title} body={banner.body ?? undefined} />
      <ModePanel orgId={orgId} serverId={serverId} view={view} facts={facts} />
      <SectionPanel
        title="Preview"
        hint="The firewall this server would get, as the server itself rendered and checked it"
      >
        {view.preview ? (
          <PreviewDetails preview={view.preview} />
        ) : (
          <EmptyState
            title="No preview yet."
            hint="One is sent after a rule or mode change, and after the server reconnects."
          />
        )}
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
  },
  block: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textBody,
  },
  line: {
    fontSize: 13,
    color: colors.textBody,
  },
  errorLine: {
    color: colors.errorText,
  },
  choice: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.bgSecondary,
  },
  choiceText: {
    fontSize: 13,
    color: colors.textBody,
  },
  code: {
    maxHeight: 360,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    backgroundColor: colors.bgSecondary,
  },
})
