import { StyleSheet, Text } from 'react-native'
import {
  Badge,
  DataTable,
  DataTableCell,
  DataTableEmpty,
  DataTableRow,
  type DataTableColumn,
  LoadingState,
  MonoText,
  SectionPanel,
  TypeNameDeleteButton,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import type { SealedSecretsServer } from '@/lib/instance-api'
import { useClearServerSealingKey, useSealedSecrets } from '@/lib/queries/admin'
import {
  CLEAR_SEALING_KEY_DESCRIPTION,
  SEALED_SECRETS_HELP,
  clearSealingKeyError,
  sealedSecretsStatus,
  sealingKeyConfirmName,
} from '@/lib/sealed-secrets'
import { colors } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'server', header: 'Server', flex: 1.2, minWidth: 140 },
  { key: 'key', header: 'Sealing Key', flex: 1.4, minWidth: 180 },
  { key: 'secrets', header: 'Secrets', width: 110 },
  { key: 'action', header: '', width: 170, align: 'end' },
]

function col(key: string): DataTableColumn {
  return COLUMNS.find((column) => column.key === key) ?? COLUMNS[0]!
}

function ClearSealingKeyButton({ row }: Readonly<{ row: SealedSecretsServer }>) {
  const mutation = useClearServerSealingKey()
  const name = sealingKeyConfirmName(row)
  return (
    <TypeNameDeleteButton
      thing="Sealing Key"
      nameOf="Server"
      verb="Clear"
      name={name}
      description={CLEAR_SEALING_KEY_DESCRIPTION}
      undoable
      onConfirm={async (typed) => {
        const result = await mutation.run({ serverId: row.id, confirmName: typed })
        if (result.ok) return true
        // A stale session opens the re-authentication sheet; keep the dialog open.
        if (result.error === null) return false
        throw new Error(clearSealingKeyError(result.cause))
      }}
    />
  )
}

function SealedSecretsRow({ row, last }: Readonly<{ row: SealedSecretsServer; last: boolean }>) {
  const status = sealedSecretsStatus(row)
  return (
    <DataTableRow last={last}>
      <DataTableCell column={col('server')}>
        <Text style={styles.cell}>{sealingKeyConfirmName(row)}</Text>
      </DataTableCell>
      <DataTableCell column={col('key')}>
        {row.sealingKey ? (
          <MonoText numberOfLines={1}>{row.sealingKey.kid}</MonoText>
        ) : (
          <Text style={panelStyles.muted}>None</Text>
        )}
      </DataTableCell>
      <DataTableCell column={col('secrets')}>
        <Badge label={status.label} tone={status.tone} />
      </DataTableCell>
      <DataTableCell column={col('action')}>
        {row.sealingKey ? <ClearSealingKeyButton row={row} /> : null}
      </DataTableCell>
    </DataTableRow>
  )
}

/**
 * Superadmin: which servers get their secrets sealed, and Clear Sealing Key
 * for a server whose daemon was rolled back to a build that cannot open them.
 */
export function SealedSecretsPanel() {
  const query = useSealedSecrets()
  const servers = query.data?.servers ?? []
  return (
    <SectionPanel title="Sealed Secrets">
      <Text style={panelStyles.muted}>{SEALED_SECRETS_HELP}</Text>
      {query.isLoading ? <LoadingState /> : null}
      {query.isError ? (
        <Text style={panelStyles.error}>
          {userErrorMessage(query.error, 'Failed to load the sealed-secrets list')}
        </Text>
      ) : null}
      {query.data ? (
        <DataTable columns={COLUMNS} minWidth={600}>
          {servers.length === 0 ? (
            <DataTableEmpty>No servers yet.</DataTableEmpty>
          ) : (
            servers.map((row, index) => (
              <SealedSecretsRow key={row.id} row={row} last={index === servers.length - 1} />
            ))
          )}
        </DataTable>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  cell: { color: colors.text, fontSize: 14 },
})
