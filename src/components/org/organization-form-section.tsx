import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { SectionPanel } from '@/components/org/section-panel'
import { Button, FormField, LoadingState, TextField } from '@/components/ui'
import {
  foldDisplayNameApostrophes,
  DISPLAY_NAME_MAX_LENGTH,
  validateDisplayName,
} from '@/lib/display-name'
import { formatLocalDateTime } from '@/lib/format-datetime'
import type { OrganizationRecord } from '@/lib/instance-api'
import { useOrganizationsQuery, useUpdateOrganization } from '@/lib/queries/auth'
import { useCan } from '@/lib/query-client'
import { colors } from '@/lib/theme'

function OrganizationNameField({
  canManage,
  name,
  fallbackLabel,
  fieldError,
  submitting,
  onChange,
}: Readonly<{
  canManage: boolean
  name: string
  fallbackLabel: string
  fieldError: string | null
  submitting: boolean
  onChange: (value: string) => void
}>) {
  if (!canManage) {
    return (
      <FormField label="Name" error={fieldError}>
        <Text style={styles.readOnlyValue}>{fallbackLabel}</Text>
      </FormField>
    )
  }
  return (
    <TextField
      label="Name"
      value={name}
      onChangeText={onChange}
      autoCapitalize="words"
      autoCorrect={false}
      editable={!submitting}
      maxLength={DISPLAY_NAME_MAX_LENGTH}
      accessibilityLabel="Organization name"
      error={fieldError}
    />
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
  const savedDisplayName = organization?.name ?? ''

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
      name: draftName,
    })
    if (!result.ok && result.error) {
      setFieldError(result.error)
    }
  }

  let body = <LoadingState />
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
          name={displayName}
          fallbackLabel={organization.name?.trim() || organization.id}
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
          <Button
            label="Save"
            busyLabel="Saving…"
            variant="primary"
            busy={submitting}
            disabled={saveDisabled}
            accessibilityLabel="Save organization"
            onPress={() => {
              void handleSave()
            }}
          />
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
  readOnlyValue: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 44,
    paddingVertical: 10,
  },
})
