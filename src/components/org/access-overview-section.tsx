import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
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
  fetchOrgServers,
  fetchPermissions,
  fetchAccessProfiles,
  fetchVisibleEnvironments,
  fetchVisibleHostings,
  fetchVisibleProjects,
  fetchVisibleRealms,
  fetchVisibleServices,
  isForbiddenError,
  resolveResourceId,
  revokeAccessGrant,
  type AccessRecord,
  type AccessScopeKind,
  type CreateAccessBody,
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
type GrantTarget = 'accessProfile' | 'permission'
type Effect = CreateAccessBody['effect']

const SCOPE_KINDS: { kind: AccessScopeKind; label: string }[] = [
  { kind: 'organization', label: 'Organization' },
  { kind: 'realm', label: 'Realm' },
  { kind: 'environment', label: 'Environment' },
  { kind: 'project', label: 'Project' },
  { kind: 'service', label: 'Service' },
  { kind: 'hosting', label: 'Hosting' },
  { kind: 'server', label: 'Server' },
]

type ScopeItem = {
  id: string
  label: string
}

async function loadScopeItems(
  kind: AccessScopeKind,
  orgId: string,
): Promise<ScopeItem[]> {
  switch (kind) {
    case 'organization':
      return [{ id: orgId, label: 'Organization' }]
    case 'realm': {
      const { realms } = await fetchVisibleRealms()
      return realms.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
    case 'environment': {
      const { environments } = await fetchVisibleEnvironments()
      return environments.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
    case 'project': {
      const { projects } = await fetchVisibleProjects()
      return projects.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
    case 'service': {
      const { services } = await fetchVisibleServices()
      return services.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
    case 'hosting': {
      const { hostings } = await fetchVisibleHostings()
      return hostings.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.id,
      }))
    }
    case 'server': {
      const { servers } = await fetchOrgServers()
      return servers.map((row) => ({
        id: row.id,
        label: row.displayName?.trim() || row.hostname?.trim() || row.id,
      }))
    }
  }
}

function scopeItemsQueryKey(kind: AccessScopeKind, orgId: string) {
  switch (kind) {
    case 'organization':
      return ['scope-items', 'organization', orgId] as const
    case 'realm':
      return visibilityQueryKeys.realms
    case 'environment':
      return visibilityQueryKeys.environments()
    case 'project':
      return visibilityQueryKeys.projects()
    case 'service':
      return visibilityQueryKeys.services()
    case 'hosting':
      return visibilityQueryKeys.hostings()
    case 'server':
      return visibilityQueryKeys.orgServers
  }
}

function grantLabel(grant: AccessRecord): string {
  if (grant.accessProfileKey) {
    return `access profile: ${grant.accessProfileKey}`
  }
  if (grant.permissionKey) {
    return `permission: ${grant.permissionKey}`
  }
  return 'unknown grant'
}

export function AccessOverviewSection({ orgId }: { orgId: string }) {
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

  const resourceQuery = useQuery({
    queryKey: visibilityQueryKeys.resourceId(scopeKind, selectedItemId),
    queryFn: () => resolveResourceId(scopeKind, selectedItemId),
    enabled: selectedItemId.length > 0,
  })

  useForbiddenRecovery(resourceQuery.error)

  const resourceId = resourceQuery.data?.resourceId ?? null
  const managePermission = getAccessManagementPermissionKey(scopeKind)
  const canManage = useCan(resourceId, managePermission)

  const [subjectKind, setSubjectKind] = useState<SubjectKind>('user')
  const [subjectId, setSubjectId] = useState('')
  const [grantTarget, setGrantTarget] = useState<GrantTarget>('accessProfile')
  const [selectedAccessProfileKey, setSelectedAccessProfileKey] = useState<string | null>(null)
  const [selectedPermissionKey, setSelectedPermissionKey] = useState<string | null>(
    null,
  )
  const [effect, setEffect] = useState<Effect>('allow')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<Set<string>>(() => new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const grantsQuery = useQuery({
    queryKey: resourceId
      ? authQueryKeys.accessGrants(resourceId)
      : ['access-grants', 'unavailable'],
    queryFn: () => fetchAccessGrants(resourceId!),
    enabled: resourceId !== null,
  })

  useForbiddenRecovery(grantsQuery.error)

  const accessProfilesQuery = useQuery({
    queryKey: authQueryKeys.accessProfiles,
    queryFn: fetchAccessProfiles,
    enabled: canManage && grantTarget === 'accessProfile',
  })

  const permissionsQuery = useQuery({
    queryKey: authQueryKeys.permissions,
    queryFn: fetchPermissions,
    enabled: canManage && grantTarget === 'permission',
  })

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
      setActionError(
        err instanceof Error ? err.message : 'Failed to revoke access grant',
      )
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

    const body: CreateAccessBody = {
      subjectKind,
      subjectId: trimmedSubjectId,
      resourceId,
      effect,
    }

    if (grantTarget === 'accessProfile') {
      if (!selectedAccessProfileKey) {
        setSubmitError('Select an access profile')
        return
      }
      body.accessProfileKey = selectedAccessProfileKey
    } else {
      if (!selectedPermissionKey) {
        setSubmitError('Select a permission')
        return
      }
      body.permissionKey = selectedPermissionKey
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await createAccessGrant(body)
      setSubjectId('')
      setSelectedAccessProfileKey(null)
      setSelectedPermissionKey(null)
      await queryClient.invalidateQueries({
        queryKey: authQueryKeys.accessGrants(resourceId),
      })
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to create access grant',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const scopeItems = scopeItemsQuery.data ?? []
  const grants = grantsQuery.data?.access ?? []

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Access</Text>
      <Text style={styles.copy}>
        Manage access profile and permission grants for organization resources.
      </Text>

      <SectionPanel title="Scope" hint="Choose the resource to manage">
        <Text style={styles.label}>Resource kind</Text>
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

        {scopeKind !== 'organization' ? (
          <>
            <Text style={styles.label}>Resource</Text>
            {scopeItemsQuery.isLoading ? (
              <Text style={orgPanelStyles.muted}>Loading resources...</Text>
            ) : scopeItemsQuery.isError ? (
              <Text style={orgPanelStyles.error}>
                {scopeItemsQuery.error instanceof Error
                  ? scopeItemsQuery.error.message
                  : 'Failed to load resources'}
              </Text>
            ) : scopeItems.length === 0 ? (
              <Text style={orgPanelStyles.muted}>
                No visible {scopeKind} resources in this organization.
              </Text>
            ) : (
              <ScrollView style={styles.pickerList} nestedScrollEnabled>
                {scopeItems.map((item) => {
                  const selected = selectedItemId === item.id
                  return (
                    <Pressable
                      key={item.id}
                      style={[
                        styles.pickerRow,
                        selected && styles.pickerRowSelected,
                      ]}
                      onPress={() => setSelectedItemId(item.id)}
                    >
                      <Text style={styles.pickerTitle}>{item.label}</Text>
                      <Text style={styles.pickerMeta}>{item.id}</Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            )}
          </>
        ) : (
          <Text style={orgPanelStyles.muted}>
            Managing access for organization {orgId}.
          </Text>
        )}

        {resourceQuery.isError ? (
          <Text style={orgPanelStyles.error}>
            {resourceQuery.error instanceof Error
              ? resourceQuery.error.message
              : 'Failed to resolve resource scope'}
          </Text>
        ) : resourceQuery.isLoading && selectedItemId ? (
          <Text style={orgPanelStyles.muted}>Resolving resource scope...</Text>
        ) : null}
      </SectionPanel>

      {resourceId === null ? (
        <SectionPanel title="Access grants">
          <Text style={orgPanelStyles.muted}>
            Select a scope with a registered resource to view grants.
          </Text>
        </SectionPanel>
      ) : (
        <>
          <SectionPanel title="Access grants" hint="Active allow and deny rows">
            {actionError ? (
              <Text style={orgPanelStyles.error}>{actionError}</Text>
            ) : null}
            {grantsQuery.isLoading && grants.length === 0 ? (
              <Text style={orgPanelStyles.muted}>Loading...</Text>
            ) : grantsQuery.isError ? (
              <Text style={orgPanelStyles.error}>
                {grantsQuery.error instanceof Error
                  ? grantsQuery.error.message
                  : 'Failed to load access grants'}
              </Text>
            ) : grants.length === 0 ? (
              <Text style={orgPanelStyles.muted}>No access grants yet.</Text>
            ) : (
              <View style={styles.list}>
                {grants.map((grant) => {
                  const isRevoking = revoking.has(grant.id)
                  const effectStyle =
                    grant.effect === 'allow' ? styles.badgeAllow : styles.badgeDeny

                  return (
                    <View key={grant.id} style={orgPanelStyles.detailCard}>
                      <View style={styles.cardHeader}>
                        <View style={styles.cardTitleBlock}>
                          <Text style={orgPanelStyles.detailTitle}>
                            {grant.subjectKind}: {grant.subjectId}
                          </Text>
                          <View style={styles.badgeRow}>
                            <Text style={[styles.badge, effectStyle]}>
                              {grant.effect}
                            </Text>
                            <Text style={orgPanelStyles.detailLine}>
                              {grantLabel(grant)}
                            </Text>
                          </View>
                        </View>
                        {canManage ? (
                          <Pressable
                            style={[
                              styles.secondaryButton,
                              isRevoking && styles.buttonDisabled,
                            ]}
                            disabled={isRevoking}
                            onPress={() => void onRevokeGrant(grant.id)}
                          >
                            <Text style={styles.secondaryButtonText}>
                              {isRevoking ? 'Revoking...' : 'Revoke'}
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </SectionPanel>

          {canManage ? (
            <SectionPanel title="Add grant" hint="Assign an access profile or permission">
              <View style={styles.form}>
                <Text style={styles.label}>Subject kind</Text>
                <View style={styles.chipRow}>
                  {(['user', 'team', 'organization'] as const).map((kind) => (
                    <Pressable
                      key={kind}
                      style={[
                        styles.chip,
                        subjectKind === kind && styles.chipActive,
                      ]}
                      onPress={() => setSubjectKind(kind)}
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
                  onChangeText={(text) => {
                    setSubjectId(text)
                    setSubmitError(null)
                  }}
                  placeholder="UUID"
                  placeholderTextColor={colors.textDim}
                  editable={!submitting}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />

                <Text style={styles.label}>Grant target</Text>
                <View style={styles.chipRow}>
                  {(['accessProfile', 'permission'] as const).map((target) => (
                    <Pressable
                      key={target}
                      style={[
                        styles.chip,
                        grantTarget === target && styles.chipActive,
                      ]}
                      onPress={() => {
                        setGrantTarget(target)
                        setSelectedAccessProfileKey(null)
                        setSelectedPermissionKey(null)
                        setSubmitError(null)
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          grantTarget === target && styles.chipTextActive,
                        ]}
                      >
                        {target === 'accessProfile' ? 'Access Profile' : 'Permission'}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>
                  {grantTarget === 'accessProfile' ? 'Access Profile' : 'Permission'}
                </Text>
                <ScrollView style={styles.pickerList} nestedScrollEnabled>
                  {grantTarget === 'accessProfile' ? (
                    accessProfilesQuery.isLoading ? (
                      <Text style={orgPanelStyles.muted}>Loading access profiles...</Text>
                    ) : (
                      (accessProfilesQuery.data?.accessProfiles ?? []).map((profile) => {
                        const selected = selectedAccessProfileKey === profile.key
                        return (
                          <Pressable
                            key={profile.key}
                            style={[
                              styles.pickerRow,
                              selected && styles.pickerRowSelected,
                            ]}
                            onPress={() => {
                              setSelectedAccessProfileKey(profile.key)
                              setSubmitError(null)
                            }}
                          >
                            <Text style={styles.pickerTitle}>
                              {profile.displayName}
                            </Text>
                            <Text style={styles.pickerMeta}>{profile.key}</Text>
                          </Pressable>
                        )
                      })
                    )
                  ) : permissionsQuery.isLoading ? (
                    <Text style={orgPanelStyles.muted}>Loading permissions...</Text>
                  ) : (
                    (permissionsQuery.data?.permissions ?? []).map(
                      (permission) => {
                        const selected = selectedPermissionKey === permission.key
                        return (
                          <Pressable
                            key={permission.key}
                            style={[
                              styles.pickerRow,
                              selected && styles.pickerRowSelected,
                            ]}
                            onPress={() => {
                              setSelectedPermissionKey(permission.key)
                              setSubmitError(null)
                            }}
                          >
                            <Text style={styles.pickerTitle}>
                              {permission.displayName}
                            </Text>
                            <Text style={styles.pickerMeta}>
                              {permission.key}
                            </Text>
                          </Pressable>
                        )
                      },
                    )
                  )}
                </ScrollView>

                <Text style={styles.label}>Effect</Text>
                <View style={styles.chipRow}>
                  {(['allow', 'deny'] as const).map((value) => (
                    <Pressable
                      key={value}
                      style={[styles.chip, effect === value && styles.chipActive]}
                      onPress={() => setEffect(value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          effect === value && styles.chipTextActive,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {submitError ? (
                  <Text style={orgPanelStyles.error}>{submitError}</Text>
                ) : null}
                <Pressable
                  style={[
                    styles.primaryButton,
                    submitting && styles.buttonDisabled,
                  ]}
                  disabled={submitting}
                  onPress={() => void onCreateGrant()}
                >
                  <Text style={styles.primaryButtonText}>
                    {submitting ? 'Creating...' : 'Create grant'}
                  </Text>
                </Pressable>
              </View>
            </SectionPanel>
          ) : (
            <SectionPanel title="Add grant">
              <Text style={orgPanelStyles.muted}>
                You don&apos;t have permission to manage access on this scope.
              </Text>
            </SectionPanel>
          )}
        </>
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
  badgeDeny: {
    color: colors.error,
    backgroundColor: colors.bgSecondary,
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
