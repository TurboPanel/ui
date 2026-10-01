import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import { Badge, ConfirmButton, EmptyState, LoadingState, SectionPanel } from '@/components/ui'
import { useAuth } from '@/lib/auth-context'
import type { OrganizationMember } from '@/lib/instance-api'
import {
  LEAVE_CONFIRM_COPY,
  ROLE_LABEL,
  countOwners,
  formatJoined,
  memberAction,
  memberDisplayName,
  removeConfirmCopy,
  roleTone,
  type MemberAction,
} from '@/lib/org-members'
import { useOrganizationMembers, useRemoveOrganizationMember } from '@/lib/queries/members'
import { queryKeys, useCan } from '@/lib/query-client'
import { spacing } from '@/lib/theme'

type RowProps = Readonly<{
  member: OrganizationMember
  action: MemberAction
  isYou: boolean
  busy: boolean
  onConfirm: (member: OrganizationMember) => void
}>

function MemberActionButton({ member, action, busy, onConfirm }: Omit<RowProps, 'isYou'>) {
  if (action === null) return null
  const copy = action === 'leave' ? LEAVE_CONFIRM_COPY : removeConfirmCopy(member)
  return (
    <ConfirmButton
      label={action === 'leave' ? 'Leave organization' : 'Remove'}
      confirmLabel={copy.confirmLabel}
      prompt={copy.prompt}
      busy={busy}
      onConfirm={() => onConfirm(member)}
    />
  )
}

function MemberRow({ member, action, isYou, busy, onConfirm }: RowProps) {
  const name = memberDisplayName(member)
  const joined = formatJoined(member.joinedAt)
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={panelStyles.detailTitle}>{isYou ? `${name} (you)` : name}</Text>
          {name === member.email ? null : (
            <Text style={panelStyles.detailLine}>{member.email}</Text>
          )}
          {joined ? <Text style={panelStyles.detailLine}>{joined}</Text> : null}
          <Badge label={ROLE_LABEL[member.role]} tone={roleTone(member.role)} />
        </View>
        <MemberActionButton member={member} action={action} busy={busy} onConfirm={onConfirm} />
      </View>
    </View>
  )
}

/** People who can open this organization, for owners and managers. */
function MembersList({ orgId }: Readonly<{ orgId: string }>) {
  const { session } = useAuth()
  const viewerId = session?.userId ?? null
  const viewerIsOwner = useCan('organization', orgId, 'organization:own')
  const membersQuery = useOrganizationMembers(orgId)
  const removal = useRemoveOrganizationMember(orgId)
  const router = useRouter()
  const queryClient = useQueryClient()
  const [removingId, setRemovingId] = useState<string | null>(null)

  const members = membersQuery.data?.members ?? []
  const ownerCount = countOwners(members)

  const onConfirm = async (member: OrganizationMember) => {
    setRemovingId(member.id)
    const result = await removal.run(member.id)
    setRemovingId(null)
    if (result.ok && member.id === viewerId) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.organizations })
      router.replace('/organizations')
    }
  }

  let body: ReactNode
  if (membersQuery.isLoading) {
    body = <LoadingState label="Loading people..." />
  } else if (membersQuery.isError) {
    body = <Text style={panelStyles.error}>{membersQuery.error.message}</Text>
  } else if (members.length === 0) {
    body = <EmptyState title="Nobody is in this organization yet." />
  } else {
    body = (
      <View style={styles.list}>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            isYou={member.id === viewerId}
            busy={removingId === member.id}
            action={memberAction({
              viewerId,
              viewerCanManage: true,
              viewerIsOwner,
              member,
              ownerCount,
            })}
            onConfirm={onConfirm}
          />
        ))}
      </View>
    )
  }

  return (
    <SectionPanel title="Members" hint="Everyone with access to this organization">
      {removal.actionError ? <Text style={panelStyles.error}>{removal.actionError}</Text> : null}
      {body}
    </SectionPanel>
  )
}

/** A plain member cannot see the list but can still leave. */
function LeaveOnly({ orgId }: Readonly<{ orgId: string }>) {
  const { session } = useAuth()
  const removal = useRemoveOrganizationMember(orgId)
  const router = useRouter()
  const queryClient = useQueryClient()
  const viewerId = session?.userId ?? null
  if (viewerId === null) return null

  const onLeave = async () => {
    const result = await removal.run(viewerId)
    if (!result.ok) return
    await queryClient.invalidateQueries({ queryKey: queryKeys.auth.organizations })
    router.replace('/organizations')
  }

  return (
    <SectionPanel
      title="Members"
      hint="Only owners and managers can see who is in this organization"
    >
      {removal.actionError ? <Text style={panelStyles.error}>{removal.actionError}</Text> : null}
      <ConfirmButton
        label="Leave organization"
        confirmLabel={LEAVE_CONFIRM_COPY.confirmLabel}
        prompt={LEAVE_CONFIRM_COPY.prompt}
        busy={removal.isPending}
        onConfirm={onLeave}
      />
    </SectionPanel>
  )
}

export function OrgMembersPanel({ orgId }: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  return canManage ? <MembersList orgId={orgId} /> : <LeaveOnly orgId={orgId} />
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardTitleBlock: { flex: 1, gap: 4 },
})
