import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Badge, Button, ConfirmButton } from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { OrganizationCaLeaf, OrganizationCaLeafRenewal } from '@/lib/instance-api'
import {
  useDeleteOrganizationCaLeaf,
  useMarkOrganizationCaLeafStale,
  useOrganizationCaLeaves,
  useRenewOrganizationCaLeaf,
} from '@/lib/queries/tls'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

const DAY_FORMAT = { includeSeconds: false, includeDate: true, timeZoneName: null } as const

/** What the certificate belongs to, in words an owner recognises. */
export function leafOwnerLabel(leaf: OrganizationCaLeaf): string {
  const server = leaf.serverName?.trim() || 'a server'
  if (leaf.kind === 'ingress') return `Database connections on ${server}`
  const cluster = leaf.managedName?.trim() || 'A database cluster'
  const where = [leaf.projectName, leaf.environmentName].filter(Boolean).join(' · ')
  return where ? `${cluster} (${where}) on ${server}` : `${cluster} on ${server}`
}

/** One line of facts: when it expires and how renewal has gone. */
export function leafFactsLine(leaf: OrganizationCaLeaf): string {
  const parts = [`Expires ${formatLocalDateTime(leaf.notAfter, DAY_FORMAT)}`]
  if (leaf.state === 'stale' && leaf.staleAt) {
    parts.push(`marked stale ${formatLocalDateTime(leaf.staleAt, DAY_FORMAT)}`)
  } else if (leaf.attempts > 0) {
    const times = leaf.attempts === 1 ? 'once' : `${String(leaf.attempts)} times`
    const last = leaf.attemptedAt ? `, last ${formatLocalDateTime(leaf.attemptedAt, DAY_FORMAT)}` : ''
    parts.push(`renewal tried ${times}${last}`)
  }
  return parts.join(' · ')
}

/** The plain sentence shown after "Renew now". */
export function renewalNotice(result: OrganizationCaLeafRenewal): string {
  if (result.outcome === 'queued') {
    return 'Renewal queued. This list updates when the server answers.'
  }
  if (result.outcome === 'stale') {
    return result.reason ?? 'Nothing uses this certificate any more, so it was marked stale.'
  }
  if (result.outcome === 'failed') {
    return result.reason ?? 'The renewal could not be queued.'
  }
  return 'A renewal for this server is already being handled.'
}

export function retireByNotice(retireBy: string | null | undefined): string | null {
  if (!retireBy) return null
  return `The previous Organization CA is retired on its own after ${formatLocalDateTime(retireBy, DAY_FORMAT)}, once nothing depends on it.`
}

function LeafRow({
  leaf,
  canManage,
  busyId,
  notice,
  onRenew,
  onStale,
  onDelete,
}: Readonly<{
  leaf: OrganizationCaLeaf
  canManage: boolean
  busyId: string | null
  notice: string | undefined
  onRenew: (leaf: OrganizationCaLeaf) => void
  onStale: (leaf: OrganizationCaLeaf) => void
  onDelete: (leaf: OrganizationCaLeaf) => void
}>) {
  const busy = busyId === leaf.id
  const blocked = busyId !== null
  const stale = leaf.state === 'stale'
  const why = stale ? leaf.staleReason : leaf.reason
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.titleRow}>
        <Text style={panelStyles.detailTitle}>{leafOwnerLabel(leaf)}</Text>
        <Badge label={stale ? 'Stale' : 'Needs renewal'} tone={stale ? 'muted' : 'pending'} />
      </View>
      {why ? <Text style={styles.why}>{why}</Text> : null}
      <Text style={panelStyles.muted}>{leafFactsLine(leaf)}</Text>
      {leaf.lastError ? <Text style={panelStyles.error}>{leaf.lastError}</Text> : null}
      {notice ? <Text style={panelStyles.muted}>{notice}</Text> : null}
      {canManage ? (
        <View style={styles.actions}>
          <Button
            label="Renew now"
            busyLabel="Renewing…"
            size="sm"
            busy={busy}
            disabled={blocked}
            onPress={() => onRenew(leaf)}
            accessibilityLabel={`Renew the certificate for ${leafOwnerLabel(leaf)}`}
          />
          {stale ? null : (
            <ConfirmButton
              label="Mark stale"
              confirmLabel="Mark stale"
              prompt="Nothing uses this certificate any more?"
              disabled={blocked}
              onConfirm={() => onStale(leaf)}
            />
          )}
          <ConfirmButton
            label="Delete record"
            confirmLabel="Delete record"
            prompt="Forget this certificate? The one on the server is not touched."
            disabled={blocked}
            onConfirm={() => onDelete(leaf)}
          />
        </View>
      ) : null}
    </View>
  )
}

/**
 * Certificates signed by the Organization CA that are due for renewal or were
 * marked stale, each with what it belongs to, why it is listed and what went
 * wrong, so a rotation never ends in a bare "2 certificates need renewal".
 */
export function OrganizationCaLeavesSection({
  orgId,
  canManage,
  retireBy,
}: Readonly<{ orgId: string; canManage: boolean; retireBy?: string | null }>) {
  const query = useOrganizationCaLeaves(orgId)
  const renew = useRenewOrganizationCaLeaf(orgId)
  const markStale = useMarkOrganizationCaLeafStale(orgId)
  const remove = useDeleteOrganizationCaLeaf(orgId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notices, setNotices] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const finish = () => setBusyId(null)
  const fail = (fallback: string) => (err: unknown) => {
    setError(userErrorMessage(err, fallback))
    finish()
  }
  const onRenew = (leaf: OrganizationCaLeaf) => {
    setBusyId(leaf.id)
    setError(null)
    renew.mutate(leaf.id, {
      onSuccess: (result) => {
        setNotices((prev) => ({ ...prev, [leaf.id]: renewalNotice(result) }))
        finish()
      },
      onError: fail('Could not renew this certificate'),
    })
  }
  const onStale = (leaf: OrganizationCaLeaf) => {
    setBusyId(leaf.id)
    setError(null)
    markStale.mutate(leaf.id, { onSuccess: finish, onError: fail('Could not mark it stale') })
  }
  const onDelete = (leaf: OrganizationCaLeaf) => {
    setBusyId(leaf.id)
    setError(null)
    remove.mutate(leaf.id, { onSuccess: finish, onError: fail('Could not delete the record') })
  }

  const data = query.data
  const rows = data?.leaves ?? []
  const retireNotice = retireByNotice(retireBy)
  if (query.isError) {
    return (
      <Text style={panelStyles.error}>
        {userErrorMessage(query.error, 'Could not load the certificate list')}
      </Text>
    )
  }
  if (rows.length === 0 && !retireNotice) return null

  return (
    <View style={styles.block}>
      {rows.length > 0 ? (
        <>
          <Text style={styles.heading}>Certificates that need attention</Text>
          <Text style={panelStyles.muted}>
            These were signed by the Organization CA. A stale one is not counted or renewed; it no
            longer holds back retiring the previous CA.
          </Text>
          {rows.map((leaf) => (
            <LeafRow
              key={leaf.id}
              leaf={leaf}
              canManage={canManage}
              busyId={busyId}
              notice={notices[leaf.id]}
              onRenew={onRenew}
              onStale={onStale}
              onDelete={onDelete}
            />
          ))}
          {data?.truncated ? (
            <Text style={panelStyles.muted}>
              More certificates need attention than are listed here. Settle these first.
            </Text>
          ) : null}
        </>
      ) : null}
      {retireNotice ? <Text style={panelStyles.muted}>{retireNotice}</Text> : null}
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  heading: { color: colors.text, fontSize: 13, fontWeight: '700' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  why: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
})
