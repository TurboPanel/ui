import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import {
  foldDisplayNameApostrophes,
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
} from '@/lib/display-name'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { OrganizationRecord } from '@/lib/instance-api'
import { useOrganizationsQuery, useUpdateOrganization } from '@/lib/queries/auth'
import { useCan } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

function OrganizationNameField({
  canManage,
  displayName,
  fallbackLabel,
  fieldError,
  submitting,
  onChange,
}: Readonly<{
  canManage: boolean
  displayName: string
  fallbackLabel: string
  fieldError: string | null
  submitting: boolean
  onChange: (value: string) => void
}>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Name</Text>
      {canManage ? (
        <TextInput
          style={[styles.input, fieldError ? styles.inputError : null]}
          value={displayName}
          onChangeText={onChange}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!submitting}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          accessibilityLabel="Organization name"
        />
      ) : (
        <Text style={styles.readOnlyValue}>{fallbackLabel}</Text>
      )}
      {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}
    </View>
  )
}

function OrganizationIdentityCard({
  organization,
}: Readonly<{ organization: OrganizationRecord }>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>Identity</Text>
      <Text style={orgPanelStyles.detailLine} selectable>
        <Text style={orgPanelStyles.detailLabel}>ID: </Text>
        {organization.id}
      </Text>
      <Text style={orgPanelStyles.detailLine}>
        <Text style={orgPanelStyles.detailLabel}>Created: </Text>
        {formatLocalDateTime(organization.createdAt)}
      </Text>
    </View>
  )
}

export function OrganizationFormSection({
  orgId,
}: Readonly<{ orgId: string }>) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const orgsQuery = useOrganizationsQuery()
  const updateOrganization = useUpdateOrganization()
  const organization = orgsQuery.data?.organizations.find((org) => org.id === orgId)
  const savedDisplayName = organization?.displayName ?? ''

  const [displayName, setDisplayName] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)

  useEffect(() => {
    setDisplayName(savedDisplayName)
    setFieldError(null)
  }, [orgId, savedDisplayName])

  const savedName = foldDisplayNameApostrophes(savedDisplayName).trim()
  const draftName = foldDisplayNameApostrophes(displayName).trim()
  const dirty = canManage && draftName !== savedName
  const submitting = updateOrganization.isPending
  const saveDisabled = !dirty || submitting

  const handleSave = async () => {
    const validationError = validateDisplayName(draftName)
    if (validationError) {
      setFieldError(validationError)
      return
    }

    setFieldError(null)
    const result = await updateOrganization.run({
      organizationId: orgId,
      displayName: draftName,
    })
    if (!result.ok && result.error) {
      setFieldError(result.error)
    }
  }

  let body = <Text style={orgPanelStyles.muted}>Loading…</Text>
  if (!orgsQuery.isLoading && !organization) {
    body = (
      <Text style={orgPanelStyles.error}>
        {orgsQuery.error instanceof Error
          ? orgsQuery.error.message
          : 'Organization not found.'}
      </Text>
    )
  } else if (organization) {
    body = (
      <>
        <OrganizationNameField
          canManage={canManage}
          displayName={displayName}
          fallbackLabel={organization.displayName?.trim() || organization.id}
          fieldError={fieldError}
          submitting={submitting}
          onChange={(value) => {
            setDisplayName(value)
            if (fieldError) {
              setFieldError(null)
            }
          }}
        />
        <OrganizationIdentityCard organization={organization} />
        {canManage ? (
          <Pressable
            style={({ pressed }) => [
              orgPanelStyles.toolbarBtnPrimary,
              saveDisabled && styles.buttonDisabled,
              pressed && !saveDisabled && styles.buttonPressed,
              webPointer,
            ]}
            disabled={saveDisabled}
            onPress={() => {
              void handleSave()
            }}
            accessibilityRole="button"
            accessibilityLabel="Save organization"
            accessibilityState={{ disabled: saveDisabled }}
          >
            <Text style={orgPanelStyles.toolbarBtnTextPrimary}>
              {submitting ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        ) : null}
      </>
    )
  }

  return (
    <SectionPanel
      title="Organization"
      hint={canManage ? 'Managers can rename this organization' : undefined}
    >
      {body}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 6,
    minHeight: 44,
  },
  inputError: {
    borderColor: colors.error,
  },
  readOnlyValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 44,
    paddingVertical: 10,
  },
  fieldError: {
    color: colors.errorText,
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
})
