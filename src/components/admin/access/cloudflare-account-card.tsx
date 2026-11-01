import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CheckList } from '@/components/admin/access/check-list'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, ConfirmButton } from '@/components/ui'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { IngressAccountRecord, IngressCheck } from '@/lib/instance-api'
import { useRecheckIngressAccount, useRemoveIngressAccount } from '@/lib/queries/ingress'
import { colors, spacing } from '@/lib/theme'

/** The stored scope answer as two check rows, Tunnel Scope and DNS Scope. */
export function scopeChecks(account: IngressAccountRecord): IngressCheck[] {
  if (!account.scopes) {
    const detail = 'Not checked yet. Use Recheck.'
    return [
      { id: 'scope-tunnels', ok: false, detail },
      { id: 'scope-dns', ok: false, detail },
    ]
  }
  return [
    {
      id: 'scope-tunnels',
      ok: account.scopes.tunnels,
      detail: account.scopes.tunnels ? 'Can manage tunnels.' : 'Cannot manage tunnels.',
    },
    {
      id: 'scope-dns',
      ok: account.scopes.dns,
      detail: account.scopes.dns ? 'Can edit DNS records.' : 'Cannot edit DNS records.',
    },
  ]
}

function zoneNames(account: IngressAccountRecord): string {
  const zones = account.scopes?.zones ?? []
  if (zones.length > 0) return zones.map((zone) => zone.name).join(', ')
  return account.zoneIds.length > 0 ? account.zoneIds.join(', ') : 'None'
}

export function CloudflareAccountCard({
  account,
  usedBy,
}: Readonly<{ account: IngressAccountRecord; usedBy: readonly string[] }>) {
  const recheck = useRecheckIngressAccount()
  const remove = useRemoveIngressAccount()
  const [checks, setChecks] = useState<IngressCheck[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inUse, setInUse] = useState<readonly string[]>([])
  const blockers = usedBy.length > 0 ? usedBy : inUse

  const runRecheck = async () => {
    setError(null)
    const result = await recheck.run(account.id)
    if (result.ok) setChecks(result.value.checks)
    else setError(result.error ?? 'Recheck failed')
  }

  const runRemove = async () => {
    setError(null)
    const result = await remove.run(account.id)
    if (!result.ok) {
      setError(result.error ?? 'Remove failed')
      return
    }
    if (!result.value.ok) {
      setInUse(result.value.hostnames ?? [])
      setError(result.value.hostnames ? null : result.value.error)
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{account.label}</Text>
      <Fact label="Account ID" value={account.accountId ?? 'Unknown'} mono />
      <Fact label="Zones" value={zoneNames(account)} />
      <Fact
        label="Last Verified"
        value={formatLocalDateTime(account.lastVerifiedAt, { fallback: 'Never' })}
      />
      <CheckList checks={checks ?? scopeChecks(account)} />
      {account.lastError ? <Text style={panelStyles.error}>{account.lastError}</Text> : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {blockers.length > 0 ? (
        <Text style={styles.muted}>
          Used by {blockers.join(', ')}. Disconnect those hostnames before removing this account.
        </Text>
      ) : null}
      <ButtonRow>
        <Button
          label="Recheck"
          busyLabel="Checking…"
          size="sm"
          busy={recheck.isPending}
          disabled={remove.isPending}
          onPress={() => void runRecheck()}
        />
        <ConfirmButton
          label="Remove"
          prompt="Remove this Cloudflare account from the control plane?"
          busy={remove.isPending}
          disabled={blockers.length > 0 || recheck.isPending}
          onConfirm={() => void runRemove()}
          stacked
        />
      </ButtonRow>
    </View>
  )
}

function Fact({
  label,
  value,
  mono = false,
}: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text selectable style={mono ? styles.mono : styles.factValue}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  title: { color: colors.text, fontSize: 14, fontWeight: '600' },
  fact: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  factLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600', minWidth: 110 },
  factValue: { color: colors.text, fontSize: 12, flexShrink: 1 },
  mono: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  muted: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
})
