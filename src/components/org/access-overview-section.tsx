import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  ConfirmButton,
  EmptyState,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  TextField,
} from '@/components/ui'
import type {
  AccessGrantRecord,
  AccessScopeKind,
  CreateAccessBody,
  InvitationRecord,
  PermissionKey,
  PermissionRecord,
} from '@/lib/instance-api'
import {
  useAccessGrants,
  useCreateAccessGrant,
  useCreateInvitation,
  useInvitations,
  usePermissions,
  useResolveResourceId,
  useRevokeAccessGrant,
  useRevokeInvitation,
  useTeams,
} from '@/lib/queries/access'
import {
  getAccessManagementPermissionKey,
  useCan,
} from '@/lib/query-client'
import { orEmptyArray } from '@/lib/or-empty-array'
import { chrome, colors, spacing } from '@/lib/theme'

type SubjectKind = CreateAccessBody['subjectKind']

const SCOPE_OPTIONS = [
  { value: 'organization', label: 'Organization' },
  { value: 'team', label: 'Team' },
] as const

const SUBJECT_KIND_OPTIONS = [
  { value: 'user', label: 'user' },
  { value: 'team', label: 'team' },
  { value: 'organization', label: 'organization' },
] as const

const PERMISSIONS_BY_SCOPE: Record<AccessScopeKind, PermissionKey[]> = {
  organization: ['organization:own', 'organization:manage'],
  team: ['team:own', 'team:manage'],
}

type ScopeItem = {
  id: string
  label: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function TeamScopePicker({
  isLoading,
  isError,
  error,
  items,
  selectedItemId,
  onSelect,
}: Readonly<{
  isLoading: boolean
  isError: boolean
  error: unknown
  items: ScopeItem[]
  selectedItemId: string
  onSelect: (id: string) => void
}>) {
  let body: ReactNode
  if (isLoading) {
    body = <LoadingState label="Loading teams..." />
  } else if (isError) {
    body = (
      <Text style={panelStyles.error}>
        {errorMessage(error, 'Failed to load teams')}
      </Text>
    )
  } else if (items.length === 0) {
    body = <EmptyState title="No teams in this organization." />
  } else {
    body = (
      <ScrollView style={styles.pickerList} nestedScrollEnabled>
        {items.map((item) => {
          const selected = selectedItemId === item.id
          return (
            <Pressable
              key={item.id}
              style={[styles.pickerRow, selected && styles.pickerRowSelected]}
              onPress={() => onSelect(item.id)}
            >
              <Text style={styles.pickerTitle}>{item.label}</Text>
              <Text style={styles.pickerMeta}>{item.id}</Text>
            </Pressable>
          )
        })}
      </ScrollView>
    )
  }

  return (
    <>
      <Text style={styles.label}>Team</Text>
      {body}
    </>
  )
}

function formatInvitationExpiry(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function InviteTeammatePanel({
  email,
  teamId,
  teamsLoading,
  teamsError,
  teamItems,
  submitting,
  submitError,
  onEmailChange,
  onTeamSelect,
  onSubmit,
}: Readonly<{
  email: string
  teamId: string
  teamsLoading: boolean
  teamsError: unknown
  teamItems: ScopeItem[]
  submitting: boolean
  submitError: string | null
  onEmailChange: (text: string) => void
  onTeamSelect: (id: string) => void
  onSubmit: () => void
}>) {
  return (
    <SectionPanel title="Invite a teammate" hint="Send an email invitation">
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={onEmailChange}
          editable={!submitting}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <TeamScopePicker
          isLoading={teamsLoading}
          isError={Boolean(teamsError)}
          error={teamsError}
          items={teamItems}
          selectedItemId={teamId}
          onSelect={onTeamSelect}
        />
        {submitError ? (
          <Text style={panelStyles.error}>{submitError}</Text>
        ) : null}
        <Button
          label="Send invitation"
          busyLabel="Sending..."
          variant="primary"
          busy={submitting}
          onPress={onSubmit}
        />
      </View>
    </SectionPanel>
  )
}

function PendingInvitationsPanel({
  isLoading,
  isError,
  error,
  invitations,
  revokingId,
  onRevoke,
}: Readonly<{
  isLoading: boolean
  isError: boolean
  error: unknown
  invitations: InvitationRecord[]
  revokingId: string | null
  onRevoke: (id: string) => void
}>) {
  let body: ReactNode
  if (isLoading) {
    body = <LoadingState label="Loading invitations..." />
  } else if (isError) {
    body = (
      <Text style={panelStyles.error}>
        {errorMessage(error, 'Failed to load invitations')}
      </Text>
    )
  } else if (invitations.length === 0) {
    body = <EmptyState title="No pending invitations." />
  } else {
    body = (
      <View style={styles.list}>
        {invitations.map((invite) => (
          <View key={invite.id} style={panelStyles.detailCard}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleBlock}>
                <Text style={panelStyles.detailTitle}>{invite.email}</Text>
                <Text style={panelStyles.detailLine}>
                  {invite.teamName?.trim() || invite.teamId}
                </Text>
                <Text style={panelStyles.detailLine}>
                  Expires {formatInvitationExpiry(invite.expiresAt)}
                </Text>
              </View>
              <ConfirmButton
                label={revokingId === invite.id ? 'Revoking...' : 'Revoke'}
                confirmLabel="Revoke invitation"
                prompt="Revoke this invitation?"
                busy={revokingId === invite.id}
                onConfirm={() => onRevoke(invite.id)}
              />
            </View>
          </View>
        ))}
      </View>
    )
  }

  return (
    <SectionPanel title="Pending invitations" hint="Unexpired invites">
      {body}
    </SectionPanel>
  )
}

function AccessGrantCard({
  grant,
  canManage,
  isRevoking,
  onRevoke,
}: Readonly<{
  grant: AccessGrantRecord
  canManage: boolean
  isRevoking: boolean
  onRevoke: (grantId: string) => void
}>) {
  return (
    <View style={panelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={panelStyles.detailTitle}>
            {grant.subjectKind}: {grant.subjectId}
          </Text>
          <View style={styles.badgeRow}>
            {/* Deny grants are not supported — every grant is an allow grant. */}
            <Badge label={grant.effect} tone="ok" />
            <Text style={panelStyles.detailLine}>
              permission: {grant.permissionKey}
            </Text>
          </View>
        </View>
        {canManage ? (
          <ConfirmButton
            label={isRevoking ? 'Revoking...' : 'Revoke'}
            confirmLabel="Revoke grant"
            prompt="Revoke this access grant?"
            busy={isRevoking}
            onConfirm={() => onRevoke(grant.id)}
          />
        ) : null}
      </View>
    </View>
  )
}

function AccessGrantsPanel({
  actionError,
  isLoading,
  isError,
  error,
  grants,
  canManage,
  revokingGrantId,
  onRevoke,
}: Readonly<{
  actionError: string | null
  isLoading: boolean
  isError: boolean
  error: unknown
  grants: AccessGrantRecord[]
  canManage: boolean
  revokingGrantId: string | null
  onRevoke: (grantId: string) => void
}>) {
  let body: ReactNode
  if (isLoading && grants.length === 0) {
    body = <LoadingState />
  } else if (isError) {
    body = (
      <Text style={panelStyles.error}>
        {errorMessage(error, 'Failed to load access grants')}
      </Text>
    )
  } else if (grants.length === 0) {
    body = <EmptyState title="No access grants yet." />
  } else {
    body = (
      <View style={styles.list}>
        {grants.map((grant) => (
          <AccessGrantCard
            key={grant.id}
            grant={grant}
            canManage={canManage}
            isRevoking={revokingGrantId === grant.id}
            onRevoke={onRevoke}
          />
        ))}
      </View>
    )
  }

  return (
    <SectionPanel title="Access grants" hint="Active allow grants">
      {actionError ? (
        <Text style={panelStyles.error}>{actionError}</Text>
      ) : null}
      {body}
    </SectionPanel>
  )
}

function AddGrantForm({
  subjectKind,
  subjectId,
  selectedPermissionKey,
  submitting,
  submitError,
  permissionsLoading,
  compatiblePermissions,
  onSubjectKindChange,
  onSubjectIdChange,
  onPermissionSelect,
  onSubmit,
}: Readonly<{
  subjectKind: SubjectKind
  subjectId: string
  selectedPermissionKey: PermissionKey | null
  submitting: boolean
  submitError: string | null
  permissionsLoading: boolean
  compatiblePermissions: PermissionRecord[]
  onSubjectKindChange: (kind: SubjectKind) => void
  onSubjectIdChange: (text: string) => void
  onPermissionSelect: (key: PermissionKey) => void
  onSubmit: () => void
}>) {
  return (
    <View style={styles.form}>
      <Text style={styles.label}>Subject kind</Text>
      <SegmentedControl
        options={SUBJECT_KIND_OPTIONS}
        value={subjectKind}
        onChange={onSubjectKindChange}
        accessibilityLabel="Subject kind"
      />

      <TextField
        label="Subject ID"
        hint="UUID"
        value={subjectId}
        onChangeText={onSubjectIdChange}
        editable={!submitting}
        autoCapitalize="none"
        autoCorrect={false}
        mono
      />

      <Text style={styles.label}>Permission</Text>
      <ScrollView style={styles.pickerList} nestedScrollEnabled>
        {permissionsLoading ? (
          <LoadingState label="Loading permissions..." />
        ) : (
          compatiblePermissions.map((permission) => {
            const selected = selectedPermissionKey === permission.key
            return (
              <Pressable
                key={permission.key}
                style={[
                  styles.pickerRow,
                  selected && styles.pickerRowSelected,
                ]}
                onPress={() => onPermissionSelect(permission.key)}
              >
                <Text style={styles.pickerTitle}>{permission.displayName}</Text>
                <Text style={styles.pickerMeta}>{permission.key}</Text>
              </Pressable>
            )
          })
        )}
      </ScrollView>

      {submitError ? (
        <Text style={panelStyles.error}>{submitError}</Text>
      ) : null}
      <Button
        label="Create grant"
        busyLabel="Creating..."
        variant="primary"
        busy={submitting}
        onPress={onSubmit}
      />
    </View>
  )
}

export function AccessOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const [scopeKind, setScopeKind] = useState<AccessScopeKind>('organization')
  const [selectedItemId, setSelectedItemId] = useState(orgId)

  const canInvite = useCan('organization', orgId, 'organization:manage')
  const teamsQuery = useTeams({ enabled: scopeKind === 'team' || canInvite })
  const teams = orEmptyArray(teamsQuery.data?.teams)
  const scopeItems = useMemo(
    () =>
      scopeKind === 'organization'
        ? [{ id: orgId, label: 'Organization' }]
        : teams.map((row) => ({
            id: row.id,
            label: row.name?.trim() || row.id,
          })),
    [scopeKind, orgId, teams],
  )

  useEffect(() => {
    if (scopeKind === 'organization') {
      setSelectedItemId(orgId)
      return
    }
    if (scopeItems.length === 0) {
      setSelectedItemId('')
      return
    }
    if (!scopeItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(scopeItems[0]!.id)
    }
  }, [scopeKind, orgId, scopeItems, selectedItemId])

  const managePermission = getAccessManagementPermissionKey(scopeKind)
  const canManage = useCan(scopeKind, selectedItemId, managePermission)

  const resourceIdQuery = useResolveResourceId(scopeKind, selectedItemId, {
    enabled: selectedItemId.length > 0,
  })
  const resourceId = resourceIdQuery.data?.resourceId ?? ''

  const [subjectKind, setSubjectKind] = useState<SubjectKind>('user')
  const [subjectId, setSubjectId] = useState('')
  const [selectedPermissionKey, setSelectedPermissionKey] = useState<PermissionKey | null>(
    null,
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteTeamId, setInviteTeamId] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)

  const inviteTeamItems = useMemo(
    () =>
      teams.map((row) => ({
        id: row.id,
        label: row.name?.trim() || row.id,
      })),
    [teams],
  )

  useEffect(() => {
    if (inviteTeamItems.length === 0) {
      setInviteTeamId('')
      return
    }
    if (!inviteTeamItems.some((item) => item.id === inviteTeamId)) {
      setInviteTeamId(inviteTeamItems[0]!.id)
    }
  }, [inviteTeamItems, inviteTeamId])

  const invitationsQuery = useInvitations(orgId, { enabled: canInvite })
  const createInvitationMutation = useCreateInvitation(orgId)
  const revokeInvitationMutation = useRevokeInvitation(orgId)

  useEffect(() => {
    setSelectedPermissionKey(null)
  }, [scopeKind])

  const grantsQuery = useAccessGrants(resourceId, {
    enabled: resourceId.length > 0,
  })
  const permissionsQuery = usePermissions({ enabled: canManage })
  const createGrantMutation = useCreateAccessGrant(resourceId)
  const revokeGrantMutation = useRevokeAccessGrant(resourceId)

  const compatiblePermissions = (permissionsQuery.data?.permissions ?? []).filter(
    (permission) => PERMISSIONS_BY_SCOPE[scopeKind].includes(permission.key),
  )

  const onRevokeGrant = (grantId: string) => {
    if (!resourceId) {
      return
    }
    setActionError(null)
    revokeGrantMutation.mutate(grantId, {
      onError: () => {
        setActionError(
          revokeGrantMutation.actionError ?? 'Failed to revoke access grant',
        )
      },
    })
  }

  const onCreateGrant = () => {
    if (!resourceId) {
      return
    }

    const trimmedSubjectId = subjectId.trim()
    if (!trimmedSubjectId) {
      setSubmitError('Subject ID is required')
      return
    }

    if (!selectedPermissionKey) {
      setSubmitError('Select a permission')
      return
    }

    const body: Omit<CreateAccessBody, 'resourceId'> = {
      subjectKind,
      subjectId: trimmedSubjectId,
      effect: 'allow',
      permissionKey: selectedPermissionKey,
    }

    setSubmitError(null)
    createGrantMutation.mutate(body, {
      onSuccess: () => {
        setSubjectId('')
        setSelectedPermissionKey(null)
      },
      onError: () => {
        setSubmitError(
          createGrantMutation.actionError ?? 'Failed to create access grant',
        )
      },
    })
  }

  const onSendInvitation = () => {
    const trimmedEmail = inviteEmail.trim()
    if (!trimmedEmail) {
      setInviteError('Email is required')
      return
    }
    if (!inviteTeamId) {
      setInviteError('Select a team')
      return
    }
    setInviteError(null)
    createInvitationMutation.mutate(
      { teamId: inviteTeamId, email: trimmedEmail },
      {
        onSuccess: () => {
          setInviteEmail('')
        },
        onError: () => {
          setInviteError(
            createInvitationMutation.actionError ?? 'Failed to send invitation',
          )
        },
      },
    )
  }

  const onRevokeInvitation = (invitationId: string) => {
    revokeInvitationMutation.mutate(invitationId)
  }

  const grants = grantsQuery.data?.access ?? []
  const pendingInvitations = orEmptyArray(invitationsQuery.data?.invitations)
  const revokingInvitationId =
    revokeInvitationMutation.isPending &&
    typeof revokeInvitationMutation.variables === 'string'
      ? revokeInvitationMutation.variables
      : null
  const revokingGrantId =
    revokeGrantMutation.isPending &&
    typeof revokeGrantMutation.variables === 'string'
      ? revokeGrantMutation.variables
      : null

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Access</Text>
      <Text style={panelStyles.pageCopy}>
        Manage permission grants for organizations and teams.
      </Text>

      {canInvite ? (
        <>
          <InviteTeammatePanel
            email={inviteEmail}
            teamId={inviteTeamId}
            teamsLoading={teamsQuery.isLoading}
            teamsError={teamsQuery.isError ? teamsQuery.error : null}
            teamItems={inviteTeamItems}
            submitting={createInvitationMutation.isPending}
            submitError={inviteError ?? createInvitationMutation.actionError}
            onEmailChange={(text) => {
              setInviteEmail(text)
              setInviteError(null)
            }}
            onTeamSelect={(id) => {
              setInviteTeamId(id)
              setInviteError(null)
            }}
            onSubmit={onSendInvitation}
          />
          <PendingInvitationsPanel
            isLoading={invitationsQuery.isLoading}
            isError={invitationsQuery.isError}
            error={invitationsQuery.error}
            invitations={pendingInvitations}
            revokingId={revokingInvitationId}
            onRevoke={onRevokeInvitation}
          />
        </>
      ) : null}

      <SegmentedControl
        options={SCOPE_OPTIONS}
        value={scopeKind}
        onChange={(kind) => {
          setScopeKind(kind)
          setActionError(null)
          setSubmitError(null)
        }}
        accessibilityLabel="Grant target"
      />

      {scopeKind === 'team' ? (
        <TeamScopePicker
          isLoading={teamsQuery.isLoading}
          isError={teamsQuery.isError}
          error={teamsQuery.error}
          items={scopeItems}
          selectedItemId={selectedItemId}
          onSelect={setSelectedItemId}
        />
      ) : (
        <Text style={panelStyles.muted}>
          Managing access for organization {orgId}.
        </Text>
      )}

      <AccessGrantsPanel
        actionError={actionError}
        isLoading={grantsQuery.isLoading}
        isError={grantsQuery.isError}
        error={grantsQuery.error}
        grants={grants}
        canManage={canManage}
        revokingGrantId={revokingGrantId}
        onRevoke={onRevokeGrant}
      />

      {canManage ? (
        <SectionPanel
          title="Add grant"
          hint="Assign a permission"
          collapsible
          defaultCollapsed
        >
          <AddGrantForm
            subjectKind={subjectKind}
            subjectId={subjectId}
            selectedPermissionKey={selectedPermissionKey}
            submitting={createGrantMutation.isPending}
            submitError={submitError ?? createGrantMutation.actionError}
            permissionsLoading={permissionsQuery.isLoading}
            compatiblePermissions={compatiblePermissions}
            onSubjectKindChange={setSubjectKind}
            onSubjectIdChange={(text) => {
              setSubjectId(text)
              setSubmitError(null)
            }}
            onPermissionSelect={(key) => {
              setSelectedPermissionKey(key)
              setSubmitError(null)
            }}
            onSubmit={onCreateGrant}
          />
        </SectionPanel>
      ) : (
        <EmptyState title="You don't have permission to manage access on this scope." />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  list: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  pickerList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pickerRowSelected: {
    backgroundColor: chrome.bgActive,
  },
  pickerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
})
