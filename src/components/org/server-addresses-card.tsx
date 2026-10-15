import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import {
  Badge,
  Button,
  ButtonRow,
  Checkbox,
  FormField,
  InlineNotice,
  ModalSheet,
  SectionPanel,
  SegmentedControl,
  TextField,
  type SegmentedOption,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { ServerAddressEntry, ServerAddressesView } from '@/lib/instance-api'
import { useSaveServerAddresses, useServerAddresses } from '@/lib/queries/servers'
import { useCan } from '@/lib/query-client'
import {
  ADDRESS_PORT_KEYS,
  ADDRESS_PORT_LABELS,
  addressLine,
  addressRowTitle,
  addressSaveErrorMessage,
  buildAddressesPayload,
  certificatePendingMessage,
  dnsNameLine,
  formFromEntry,
  mainConnectionLine,
  portOverridesLine,
  SERVER_ADDRESSES_TITLE,
  validateAddressForm,
  type AddressMode,
  type AddressPortKey,
  type ServerAddressForm,
  type ServerAddressFormErrors,
} from '@/lib/server-addresses'
import { colors, spacing } from '@/lib/theme'

const MODE_OPTIONS: readonly SegmentedOption<AddressMode>[] = [
  { value: 'own', label: "This server's own address" },
  { value: 'different', label: 'A different address' },
]

function AddressRow({
  entry,
  canManage,
  onEdit,
}: Readonly<{ entry: ServerAddressEntry; canManage: boolean; onEdit: () => void }>) {
  const title = addressRowTitle(entry)
  const ports = portOverridesLine(entry.ports)
  const main = mainConnectionLine(entry)
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={panelStyles.detailTitle}>{title}</Text>
        {main ? <Badge label={main} tone="info" /> : null}
        {canManage ? (
          <Button
            label="Edit"
            size="sm"
            variant="secondary"
            accessibilityLabel={`Edit ${title}`}
            onPress={onEdit}
          />
        ) : null}
      </View>
      <Text style={panelStyles.detailLine}>
        <Text style={panelStyles.detailLabel}>DNS name: </Text>
        {dnsNameLine(entry)}
      </Text>
      <Text style={panelStyles.detailLine} selectable>
        <Text style={panelStyles.detailLabel}>Address: </Text>
        {addressLine(entry)}
      </Text>
      {ports ? (
        <Text style={panelStyles.detailLine}>
          <Text style={panelStyles.detailLabel}>Router ports: </Text>
          {ports}
        </Text>
      ) : null}
    </View>
  )
}

/** Form state, validation and the save call for one dialog, kept out of the component body. */
function useAddressDialog(
  orgId: string,
  serverId: string,
  view: ServerAddressesView,
  entry: ServerAddressEntry,
  onSaved: (pendingMessage: string | null) => void,
) {
  const [form, setForm] = useState<ServerAddressForm>(() => formFromEntry(entry))
  const [errors, setErrors] = useState<ServerAddressFormErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const save = useSaveServerAddresses(orgId, serverId)

  const update = (patch: Partial<ServerAddressForm>) => setForm((prev) => ({ ...prev, ...patch }))
  const setPort = (key: AddressPortKey, value: string) =>
    setForm((prev) => ({ ...prev, ports: { ...prev.ports, [key]: value } }))

  const submit = async () => {
    const found = validateAddressForm(form)
    setErrors(found)
    setSaveError(null)
    if (Object.keys(found).length > 0) return
    const payload = buildAddressesPayload(view, entry, form)
    const result = await save.run(payload.addresses)
    if (result.ok) {
      const saved = result.value
      onSaved(
        saved.certificateUpdatePending
          ? certificatePendingMessage(saved.certificateUpdateReason, saved.certificateUpdateMessage)
          : null,
      )
      return
    }
    if (result.error !== null) setSaveError(addressSaveErrorMessage(result.cause, payload))
  }

  return { form, errors, saveError, busy: save.isPending, update, setPort, submit }
}

function PortFields({
  form,
  errors,
  savedPorts,
  disabled,
  onChange,
}: Readonly<{
  form: ServerAddressForm
  errors: ServerAddressFormErrors
  savedPorts: ServerAddressEntry['ports']
  disabled: boolean
  onChange: (key: AddressPortKey, value: string) => void
}>) {
  return (
    <FormField
      label="Port, if your router forwards a different one"
      hint="Leave empty when clients use the usual port."
    >
      <View style={styles.portGrid}>
        {ADDRESS_PORT_KEYS.map((key) => (
          <View key={key} style={styles.portField}>
            <TextField
              label={ADDRESS_PORT_LABELS[key]}
              value={form.ports[key]}
              onChangeText={(value) => onChange(key, value)}
              keyboardType="number-pad"
              placeholder="usual port"
              editable={!disabled}
              error={errors[key]}
              hint={savedPorts[key] === null ? 'Saved as not forwarded here.' : undefined}
            />
          </View>
        ))}
      </View>
    </FormField>
  )
}

function AddressEditDialog({
  orgId,
  serverId,
  view,
  entry,
  onClose,
  onSaved,
}: Readonly<{
  orgId: string
  serverId: string
  view: ServerAddressesView
  entry: ServerAddressEntry
  onClose: () => void
  onSaved: (pendingMessage: string | null) => void
}>) {
  const dialog = useAddressDialog(orgId, serverId, view, entry, onSaved)
  const { form, errors, busy } = dialog
  return (
    <ModalSheet
      visible
      title={`Edit ${addressRowTitle(entry)} address`}
      description="What clients are told to connect to. This does not change the server's own network settings."
      maxWidth={520}
      onRequestClose={() => {
        // Escape, backdrop and Android back wait for an in-flight save.
        if (!busy) onClose()
      }}
      footer={
        <ButtonRow align="end">
          <Button label="Cancel" variant="secondary" disabled={busy} onPress={onClose} />
          <Button
            label="Save"
            busyLabel="Saving…"
            variant="primary"
            busy={busy}
            onPress={() => {
              void dialog.submit()
            }}
          />
        </ButtonRow>
      }
    >
      <View style={styles.form}>
        <TextField
          label="DNS name clients use (optional)"
          value={form.hostname}
          onChangeText={(hostname) => dialog.update({ hostname })}
          placeholder="db.example.com"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          error={errors.hostname}
        />
        <FormField
          label="Address clients use"
          hint="A different address: for example, a router that forwards ports to this server."
          error={errors.address}
        >
          <SegmentedControl
            options={MODE_OPTIONS}
            value={form.mode}
            disabled={busy}
            accessibilityLabel="Address clients use"
            onChange={(mode) => dialog.update({ mode })}
          />
        </FormField>
        {form.mode === 'different' ? (
          <>
            <TextField
              label="IPv4 address"
              value={form.addressV4}
              onChangeText={(addressV4) => dialog.update({ addressV4 })}
              placeholder="203.0.113.7"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              error={errors.addressV4}
            />
            <TextField
              label="IPv6 address"
              value={form.addressV6}
              onChangeText={(addressV6) => dialog.update({ addressV6 })}
              placeholder="2001:db8::7"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              error={errors.addressV6}
            />
          </>
        ) : null}
        <PortFields
          form={form}
          errors={errors}
          savedPorts={entry.ports}
          disabled={busy}
          onChange={dialog.setPort}
        />
        <Checkbox
          checked={form.primary}
          disabled={busy}
          label="Use in the main connection string"
          onPress={() => dialog.update({ primary: !form.primary })}
        />
        {entry.main && !entry.primary ? (
          <Text style={panelStyles.muted}>
            This row fills the main connection string now because no row is chosen.
          </Text>
        ) : null}
        {dialog.saveError ? (
          <Text style={panelStyles.error} accessibilityRole="alert">
            {dialog.saveError}
          </Text>
        ) : null}
      </View>
    </ModalSheet>
  )
}

/**
 * "Addresses clients use": one row for Public and one per datacenter. Hidden
 * when the control plane predates the route (404) or the viewer cannot manage.
 */
export function ServerAddressesCard({
  orgId,
  serverId,
}: Readonly<{ orgId: string; serverId: string }>) {
  const canManage = useCan('server', serverId, 'organization:manage')
  const query = useServerAddresses(orgId, serverId, { enabled: canManage })
  const [editing, setEditing] = useState<ServerAddressEntry | null>(null)
  const [pendingNotice, setPendingNotice] = useState<string | null>(null)
  const view = query.data

  // A failed background re-read keeps showing the last good list.
  if (query.isError && !view) {
    return (
      <SectionPanel title={SERVER_ADDRESSES_TITLE}>
        <Text style={panelStyles.error} accessibilityRole="alert">
          Could not load the addresses clients use.
        </Text>
      </SectionPanel>
    )
  }
  if (!view) return null

  return (
    <SectionPanel
      title={SERVER_ADDRESSES_TITLE}
      hint="What clients are told to connect to. This does not change the server's own network settings."
    >
      {view.addressNeeded ? (
        <InlineNotice
          tone="warning"
          title="Set the address clients use"
          body="External access is on, but no row gives clients a DNS name or an address yet."
        />
      ) : null}
      {pendingNotice ? <InlineNotice tone="warning" title={pendingNotice} /> : null}
      <View style={styles.list}>
        {view.addresses.map((entry) => (
          <AddressRow
            key={entry.datacenterId ?? entry.scope}
            entry={entry}
            canManage={canManage}
            onEdit={() => setEditing(entry)}
          />
        ))}
      </View>
      {editing ? (
        <AddressEditDialog
          orgId={orgId}
          serverId={serverId}
          view={view}
          entry={editing}
          onClose={() => setEditing(null)}
          onSaved={(pendingMessage) => {
            setEditing(null)
            setPendingNotice(pendingMessage)
          }}
        />
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  row: {
    gap: 2,
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.borderSubtle,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  form: {
    gap: spacing.md,
  },
  portGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  portField: {
    flexGrow: 1,
    flexBasis: 140,
  },
})
