import { useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  ConfirmButton,
  EmptyState,
  FormField,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
  TextField,
  Toggle,
  type SelectOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  EMPTY_FIREWALL_RULE_FORM,
  FIREWALL_ACTION_OPTIONS,
  FIREWALL_PROTO_OPTIONS,
  FIREWALL_RULE_LIMIT,
  FIREWALL_SCOPE_OPTIONS,
  FIREWALL_SOURCE_OPTIONS,
  describeFirewallRule,
  firewallErrorMessage,
  firewallRuleFormFromRecord,
  validateFirewallRuleForm,
  type FirewallRuleForm,
  type FirewallRuleFormErrors,
} from '@/lib/firewall'
import type { FirewallRule, FirewallRuleBody, FirewallSourceKind } from '@/lib/instance-api'
import {
  useCreateFirewallRule,
  useDeleteFirewallRule,
  useFirewallRules,
  useUpdateFirewallRule,
} from '@/lib/queries/firewall'
import { useOrgServers } from '@/lib/queries/servers'
import { colors, spacing } from '@/lib/theme'

/** Resolves to null on success, or the refusal to show on the form. */
type SubmitRule = (body: FirewallRuleBody) => Promise<string | null>

function RuleFormView({
  initial,
  serverOptions,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: Readonly<{
  initial: FirewallRuleForm
  serverOptions: readonly SelectOption[]
  submitLabel: string
  busy: boolean
  onSubmit: SubmitRule
  onCancel: () => void
}>) {
  const [form, setForm] = useState<FirewallRuleForm>(initial)
  const [errors, setErrors] = useState<FirewallRuleFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const update = (patch: Partial<FirewallRuleForm>) => {
    setForm((current) => ({ ...current, ...patch }))
  }

  const submit = async () => {
    const result = validateFirewallRuleForm(form)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setFormError(await onSubmit(result.body))
  }

  return (
    <View style={styles.form}>
      {formError ? <Text style={panelStyles.error}>{formError}</Text> : null}
      <TextField
        label="Label"
        value={form.label}
        placeholder="Postgres from my other servers"
        hint="Shown here and used as the comment on the server. Letters, digits, spaces and . _ : / -"
        error={errors.label}
        editable={!busy}
        onChangeText={(label) => update({ label })}
      />
      <FormField label="Action">
        <SegmentedControl
          options={FIREWALL_ACTION_OPTIONS}
          value={form.action}
          disabled={busy}
          accessibilityLabel="Action"
          onChange={(action) => update({ action })}
        />
      </FormField>
      <FormField label="Protocol" error={errors.proto}>
        <SegmentedControl
          options={FIREWALL_PROTO_OPTIONS}
          value={form.proto}
          disabled={busy}
          accessibilityLabel="Protocol"
          onChange={(proto) => update({ proto })}
        />
      </FormField>
      <TextField
        label="Port or range"
        value={form.ports}
        placeholder="5432 or 5432-5440"
        hint="Leave empty for every port. Only a block rule may do that."
        error={errors.ports}
        mono
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(ports) => update({ ports })}
      />
      <FormField
        label="Applies to"
        hint="Ports published by containers are checked after Docker maps them."
      >
        <SegmentedControl
          options={FIREWALL_SCOPE_OPTIONS}
          value={form.scope}
          disabled={busy}
          accessibilityLabel="Applies to"
          onChange={(scope) => update({ scope })}
        />
      </FormField>
      <FormField label="Who may connect">
        <Select
          value={form.sourceKind}
          options={FIREWALL_SOURCE_OPTIONS}
          placeholder="Who may connect"
          disabled={busy}
          accessibilityLabel="Who may connect"
          onChange={(value) => {
            if (value) update({ sourceKind: value as FirewallSourceKind })
          }}
        />
      </FormField>
      {form.sourceKind === 'addresses' ? (
        <TextField
          label="Addresses"
          value={form.addresses}
          placeholder={'203.0.113.5\n10.0.0.0/24'}
          hint="IP addresses or ranges, one per line or separated by commas."
          error={errors.addresses}
          mono
          multiline
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(addresses) => update({ addresses })}
        />
      ) : null}
      <FormField label="Server" hint="Pick one server, or leave every server.">
        <Select
          value={form.serverId}
          options={serverOptions}
          placeholder="Every server"
          noneLabel="Every server"
          disabled={busy}
          accessibilityLabel="Server"
          onChange={(serverId) => update({ serverId })}
        />
      </FormField>
      <Checkbox
        label="Enabled"
        checked={form.isEnabled}
        disabled={busy}
        onPress={() => update({ isEnabled: !form.isEnabled })}
      />
      <ButtonRow>
        <Button
          label={submitLabel}
          busyLabel="Saving…"
          variant="primary"
          size="sm"
          busy={busy}
          onPress={() => {
            void submit()
          }}
        />
        <Button label="Cancel" size="sm" disabled={busy} onPress={onCancel} />
      </ButtonRow>
    </View>
  )
}

function actionBadge(rule: Readonly<FirewallRule>): { tone: 'ok' | 'danger'; label: string } {
  if (rule.action === 'accept') return { tone: 'ok', label: 'Allow' }
  return { tone: 'danger', label: rule.action === 'reject' ? 'Reject' : 'Block' }
}

function RuleRow({
  rule,
  serverName,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: Readonly<{
  rule: FirewallRule
  serverName: string
  busy: boolean
  onToggle: (isEnabled: boolean) => void
  onEdit: () => void
  onDelete: () => void
}>) {
  const badge = actionBadge(rule)
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowTitle}>
          <Text style={styles.rowLabel}>{rule.label}</Text>
          <Badge tone={badge.tone} label={badge.label} />
        </View>
        <Toggle
          value={rule.isEnabled}
          busy={busy}
          onLabel="Enabled"
          offLabel="Paused"
          accessibilityLabel={`Enable ${rule.label}`}
          onValueChange={onToggle}
        />
      </View>
      <Text style={styles.description}>{describeFirewallRule(rule)}</Text>
      <Text style={panelStyles.muted}>On: {serverName}</Text>
      <ButtonRow>
        <Button label="Edit" size="sm" disabled={busy} onPress={onEdit} />
        <ConfirmButton
          label="Delete"
          confirmLabel="Confirm delete"
          prompt="Delete this rule? Servers stop including it in their preview."
          disabled={busy}
          onConfirm={onDelete}
        />
      </ButtonRow>
    </View>
  )
}

type Editing = { kind: 'create' } | { kind: 'edit'; rule: FirewallRule } | null

function useRuleActions(orgId: string) {
  const createMutation = useCreateFirewallRule(orgId)
  const updateMutation = useUpdateFirewallRule(orgId)
  const deleteMutation = useDeleteFirewallRule(orgId)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const create: SubmitRule = async (body) => {
    try {
      await createMutation.mutateAsync(body)
      return null
    } catch (err) {
      return firewallErrorMessage(err, 'Failed to add the rule')
    }
  }

  const update = async (ruleId: string, body: FirewallRuleBody): Promise<string | null> => {
    try {
      await updateMutation.mutateAsync({ ruleId, patch: body })
      return null
    } catch (err) {
      return firewallErrorMessage(err, 'Failed to save the rule')
    }
  }

  const runRowAction = async (ruleId: string, action: () => Promise<unknown>, fallback: string) => {
    setPendingId(ruleId)
    try {
      await action()
      setNotice(null)
    } catch (err) {
      setNotice(firewallErrorMessage(err, fallback))
    } finally {
      setPendingId(null)
    }
  }

  const toggle = (ruleId: string, isEnabled: boolean) =>
    runRowAction(
      ruleId,
      () => updateMutation.mutateAsync({ ruleId, patch: { isEnabled } }),
      'Failed to update the rule'
    )

  const remove = (ruleId: string) =>
    runRowAction(ruleId, () => deleteMutation.mutateAsync(ruleId), 'Failed to delete the rule')

  return {
    notice,
    pendingId,
    saving: createMutation.isPending || updateMutation.isPending,
    create,
    update,
    toggle,
    remove,
  }
}

function RuleList({
  rules,
  serverNames,
  actions,
  onEdit,
}: Readonly<{
  rules: readonly FirewallRule[]
  serverNames: ReadonlyMap<string, string>
  actions: ReturnType<typeof useRuleActions>
  onEdit: (rule: FirewallRule) => void
}>) {
  if (rules.length === 0) {
    return (
      <EmptyState
        title="No rules yet."
        hint="Servers get the ports your deployments publish automatically; add a rule to allow or block something specific."
      />
    )
  }
  return (
    <View style={styles.list}>
      {rules.map((rule) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          serverName={
            rule.serverId ? (serverNames.get(rule.serverId) ?? 'One server') : 'Every server'
          }
          busy={actions.pendingId === rule.id}
          onToggle={(isEnabled) => {
            void actions.toggle(rule.id, isEnabled)
          }}
          onEdit={() => onEdit(rule)}
          onDelete={() => {
            void actions.remove(rule.id)
          }}
        />
      ))}
    </View>
  )
}

function EditorView({
  editing,
  serverOptions,
  actions,
  onDone,
}: Readonly<{
  editing: NonNullable<Editing>
  serverOptions: readonly SelectOption[]
  actions: ReturnType<typeof useRuleActions>
  onDone: () => void
}>) {
  const initial =
    editing.kind === 'edit' ? firewallRuleFormFromRecord(editing.rule) : EMPTY_FIREWALL_RULE_FORM
  const submit: SubmitRule = async (body) => {
    const refusal =
      editing.kind === 'edit'
        ? await actions.update(editing.rule.id, body)
        : await actions.create(body)
    if (!refusal) onDone()
    return refusal
  }
  return (
    <RuleFormView
      initial={initial}
      serverOptions={serverOptions}
      submitLabel={editing.kind === 'edit' ? 'Save rule' : 'Add rule'}
      busy={actions.saving}
      onSubmit={submit}
      onCancel={onDone}
    />
  )
}

/**
 * The rules an operator typed, organization-wide or for one server. What the
 * deployments publish is worked out on its own and is not listed here. Owners
 * and managers only; the API refuses everyone else.
 */
export function FirewallRulesPanel({ orgId }: Readonly<{ orgId: string }>) {
  const rulesQuery = useFirewallRules(orgId)
  const serversQuery = useOrgServers(orgId)
  const actions = useRuleActions(orgId)
  const [editing, setEditing] = useState<Editing>(null)

  const servers = serversQuery.data?.servers
  const serverOptions = useMemo<SelectOption[]>(
    () => (servers ?? []).map((server) => ({ value: server.id, label: server.name ?? server.id })),
    [servers]
  )
  const serverNames = useMemo(
    () => new Map((servers ?? []).map((server) => [server.id, server.name ?? server.id])),
    [servers]
  )

  const rules = rulesQuery.data?.rules ?? []
  const loadError = rulesQuery.error
    ? firewallErrorMessage(rulesQuery.error, 'Failed to load the rules')
    : null
  const atLimit = rules.length >= FIREWALL_RULE_LIMIT

  return (
    <SectionPanel
      title="Rules"
      hint="Rules you add appear in each server’s preview. Applying them is switched on separately."
    >
      {actions.notice ? <InlineNotice tone="warning" title={actions.notice} /> : null}
      {loadError ? <Text style={panelStyles.error}>{loadError}</Text> : null}
      {rulesQuery.isLoading ? <LoadingState label="Loading rules…" /> : null}
      {editing ? (
        <EditorView
          key={editing.kind === 'edit' ? editing.rule.id : 'create'}
          editing={editing}
          serverOptions={serverOptions}
          actions={actions}
          onDone={() => setEditing(null)}
        />
      ) : (
        <ButtonRow>
          <Button
            label="Add rule"
            variant="primary"
            size="sm"
            disabled={atLimit}
            onPress={() => setEditing({ kind: 'create' })}
          />
          {rulesQuery.data ? (
            <Text style={panelStyles.muted}>
              {rules.length} of {FIREWALL_RULE_LIMIT} rules
            </Text>
          ) : null}
        </ButtonRow>
      )}
      {rulesQuery.data ? (
        <RuleList
          rules={rules}
          serverNames={serverNames}
          actions={actions}
          onEdit={(rule) => setEditing({ kind: 'edit', rule })}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 8,
    padding: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.bgSecondary,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    flexShrink: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textTitle,
  },
  description: {
    fontSize: 13,
    color: colors.textBody,
  },
})
