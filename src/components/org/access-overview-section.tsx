import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  createAccessGrant,
  fetchAccessGrants,
  fetchPermissions,
  fetchVisibleTeams,
  isForbiddenError,
  resolveResourceId,
  revokeAccessGrant,
  type AccessGrantRecord,
  type AccessScopeKind,
  type CreateAccessBody,
  type PermissionKey,
  type PermissionRecord,
} from '@/lib/instance-api'
import {
  authQueryKeys,
  getAccessManagementPermissionKey,
  useCan,
  useForbiddenRecovery,
  visibilityQueryKeys,
} from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

type SubjectKind = CreateAccessBody['subjectKind']

const SCOPE_KINDS: { kind: AccessScopeKind; label: string }[] = [
  { kind: 'organization', label: 'Organization' },
  { kind: 'team', label: 'Team' },
]

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

async function loadScopeItems(
  kind: AccessScopeKind,
  orgId: string,
): Promise<ScopeItem[]> {
  switch (kind) {
    case 'organization':
      return [{ id: orgId, label: 'Organization' }]
    case 'team': {
      const { teams } = await fetchVisibleTeams()
      return teams.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
  }
}

function scopeItemsQueryKey(kind: AccessScopeKind, orgId: string) {
  switch (kind) {
    case 'organization':
      return ['scope-items', 'organization', orgId] as const
    case 'team':
      return visibilityQueryKeys.teams
  }
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
    body = <Text style={orgPanelStyles.muted}>Loading teams...</Text>
  } else if (isError) {
    body = (
      <Text style={orgPanelStyles.error}>
        {errorMessage(error, 'Failed to load teams')}
      </Text>
    )
  } else if (items.length === 0) {
    body = (
      <Text style={orgPanelStyles.muted}>No teams in this organization.</Text>
    )
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
  // Deny grants are not supported — every grant is an allow grant.
  const effectStyle = styles.badgeAllow

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={orgPanelStyles.detailTitle}>
            {grant.subjectKind}: {grant.subjectId}
          </Text>
          <View style={styles.badgeRow}>
            <Text style={[styles.badge, effectStyle]}>{grant.effect}</Text>
            <Text style={orgPanelStyles.detailLine}>
              permission: {grant.permissionKey}
            </Text>
          </View>
        </View>
        {canManage ? (
          <Pressable
            style={[styles.secondaryButton, isRevoking && styles.buttonDisabled]}
            disabled={isRevoking}
            onPress={() => onRevoke(grant.id)}
          >
            <Text style={styles.secondaryButtonText}>
              {isRevoking ? 'Revoking...' : 'Revoke'}
            </Text>
          </Pressable>
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
  revoking,
  onRevoke,
}: Readonly<{
  actionError: string | null
  isLoading: boolean
  isError: boolean
  error: unknown
  grants: AccessGrantRecord[]
  canManage: boolean
  revoking: ReadonlySet<string>
  onRevoke: (grantId: string) => void
}>) {
  let body: ReactNode
  if (isLoading && grants.length === 0) {
    body = <Text style={orgPanelStyles.muted}>Loading...</Text>
  } else if (isError) {
    body = (
      <Text style={orgPanelStyles.error}>
        {errorMessage(error, 'Failed to load access grants')}
      </Text>
    )
  } else if (grants.length === 0) {
    body = <Text style={orgPanelStyles.muted}>No access grants yet.</Text>
  } else {
    body = (
      <View style={styles.list}>
        {grants.map((grant) => (
          <AccessGrantCard
            key={grant.id}
            grant={grant}
            canManage={canManage}
            isRevoking={revoking.has(grant.id)}
            onRevoke={onRevoke}
          />
        ))}
      </View>
    )
  }

  return (
    <SectionPanel title="Access grants" hint="Active allow grants">
      {actionError ? (
        <Text style={orgPanelStyles.error}>{actionError}</Text>
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
      <View style={styles.chipRow}>
        {(['user', 'team', 'organization'] as const).map((kind) => (
          <Pressable
            key={kind}
            style={[styles.chip, subjectKind === kind && styles.chipActive]}
            onPress={() => onSubjectKindChange(kind)}
          >
            <Text
              style={[
                styles.chipText,
                subjectKind === kind && styles.chipTextActive,
              ]}
            >
              {kind}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Subject ID</Text>
      <TextInput
        value={subjectId}
        onChangeText={onSubjectIdChange}
        placeholder="UUID"
        placeholderTextColor={colors.textDim}
        editable={!submitting}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.label}>Permission</Text>
      <ScrollView style={styles.pickerList} nestedScrollEnabled>
        {permissionsLoading ? (
          <Text style={orgPanelStyles.muted}>Loading permissions...</Text>
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
        <Text style={orgPanelStyles.error}>{submitError}</Text>
      ) : null}
      <Pressable
        style={[styles.primaryButton, submitting && styles.buttonDisabled]}
        disabled={submitting}
        onPress={onSubmit}
      >
        <Text style={styles.primaryButtonText}>
          {submitting ? 'Creating...' : 'Create grant'}
        </Text>
      </Pressable>
    </View>
  )
}

export function AccessOverviewSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()

  const [scopeKind, setScopeKind] = useState<AccessScopeKind>('organization')
  const [selectedItemId, setSelectedItemId] = useState(orgId)

  const scopeItemsQuery = useQuery({
    queryKey: scopeItemsQueryKey(scopeKind, orgId),
    queryFn: () => loadScopeItems(scopeKind, orgId),
    enabled: orgId.length > 0,
  })

  useForbiddenRecovery(scopeItemsQuery.error)

  useEffect(() => {
    if (scopeKind === 'organization') {
      setSelectedItemId(orgId)
      return
    }
    const items = scopeItemsQuery.data ?? []
    if (items.length === 0) {
      setSelectedItemId('')
      return
    }
    if (!items.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(items[0]!.id)
    }
  }, [scopeKind, orgId, scopeItemsQuery.data, selectedItemId])

  const managePermission = getAccessManagementPermissionKey(scopeKind)
  const canManage = useCan(scopeKind, selectedItemId, managePermission)

  const resourceIdQuery = useQuery({
    queryKey: ['resource-id', scopeKind, selectedItemId],
    queryFn: () => resolveResourceId(scopeKind, selectedItemId),
    enabled: selectedItemId.length > 0,
  })

  useForbiddenRecovery(resourceIdQuery.error)

  const resourceId = resourceIdQuery.data?.resourceId ?? ''

  const [subjectKind, setSubjectKind] = useState<SubjectKind>('user')
  const [subjectId, setSubjectId] = useState('')
  const [selectedPermissionKey, setSelectedPermissionKey] = useState<PermissionKey | null>(
    null,
  )
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedPermissionKey(null)
  }, [scopeKind])

  const grantsQuery = useQuery({
    queryKey: authQueryKeys.accessGrants(resourceId),
    queryFn: () => fetchAccessGrants(resourceId),
    enabled: resourceId.length > 0,
  })

  useForbiddenRecovery(grantsQuery.error)

  const permissionsQuery = useQuery({
    queryKey: authQueryKeys.permissions,
    queryFn: fetchPermissions,
    enabled: canManage,
  })

  const compatiblePermissions = (permissionsQuery.data?.permissions ?? []).filter(
    (permission) => PERMISSIONS_BY_SCOPE[scopeKind].includes(permission.key),
  )

  const onRevokeGrant = async (grantId: string) => {
    if (!resourceId) {
      return
    }

    setRevoking((current) => new Set(current).add(grantId))
    setActionError(null)
    try {
      await revokeAccessGrant(grantId)
      await queryClient.invalidateQueries({
        queryKey: authQueryKeys.accessGrants(resourceId),
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setActionError(errorMessage(err, 'Failed to revoke access grant'))
    } finally {
      setRevoking((current) => {
        const next = new Set(current)
        next.delete(grantId)
        return next
      })
    }
  }

  const onCreateGrant = async () => {
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

    const body: CreateAccessBody = {
      resourceId,
      subjectKind,
      subjectId: trimmedSubjectId,
      effect: 'allow',
      permissionKey: selectedPermissionKey,
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await createAccessGrant(body)
      setSubjectId('')
      setSelectedPermissionKey(null)
      await queryClient.invalidateQueries({
        queryKey: authQueryKeys.accessGrants(resourceId),
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setSubmitError(errorMessage(err, 'Failed to create access grant'))
    } finally {
      setSubmitting(false)
    }
  }

  const scopeItems = scopeItemsQuery.data ?? []
  const grants = grantsQuery.data?.access ?? []

  return (
    <View style={styles.root}>
      <Text style={orgPanelStyles.pageTitle}>Access</Text>
      <Text style={styles.copy}>
        Manage permission grants for organizations and teams.
      </Text>

      <SectionPanel title="Scope" hint="Choose the grant target">
        <Text style={styles.label}>Grant target</Text>
        <View style={styles.chipRow}>
          {SCOPE_KINDS.map(({ kind, label }) => (
            <Pressable
              key={kind}
              style={[styles.chip, scopeKind === kind && styles.chipActive]}
              onPress={() => {
                setScopeKind(kind)
                setActionError(null)
                setSubmitError(null)
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  scopeKind === kind && styles.chipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {scopeKind === 'team' ? (
          <TeamScopePicker
            isLoading={scopeItemsQuery.isLoading}
            isError={scopeItemsQuery.isError}
            error={scopeItemsQuery.error}
            items={scopeItems}
            selectedItemId={selectedItemId}
            onSelect={setSelectedItemId}
          />
        ) : (
          <Text style={orgPanelStyles.muted}>
            Managing access for organization {orgId}.
          </Text>
        )}
      </SectionPanel>

      <AccessGrantsPanel
        actionError={actionError}
        isLoading={grantsQuery.isLoading}
        isError={grantsQuery.isError}
        error={grantsQuery.error}
        grants={grants}
        canManage={canManage}
        revoking={revoking}
        onRevoke={(grantId) => void onRevokeGrant(grantId)}
      />

      {canManage ? (
        <SectionPanel title="Add grant" hint="Assign a permission">
          <AddGrantForm
            subjectKind={subjectKind}
            subjectId={subjectId}
            selectedPermissionKey={selectedPermissionKey}
            submitting={submitting}
            submitError={submitError}
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
            onSubmit={() => void onCreateGrant()}
          />
        </SectionPanel>
      ) : (
        <SectionPanel title="Add grant">
          <Text style={orgPanelStyles.muted}>
            You don&apos;t have permission to manage access on this scope.
          </Text>
        </SectionPanel>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    gap: spacing.lg,
  },
  heading: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  copy: {
    color: colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
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
  badge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeAllow: {
    color: colors.accent,
    backgroundColor: colors.bgActive,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  chipTextActive: {
    color: colors.accent,
  },
  pickerList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  pickerRowSelected: {
    backgroundColor: colors.bgActive,
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
  primaryButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.borderChip,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  secondaryButtonText: {
    color: colors.textChip,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
})
