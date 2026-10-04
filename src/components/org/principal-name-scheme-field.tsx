import { useState } from 'react'
import { Text } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { panelStyles } from '@/components/ui/panel-styles'
import { FormField, Select } from '@/components/ui'
import { fetchOrgPrincipalDefaults } from '@/lib/instance-api'
import { queryKeys, useCan } from '@/lib/query-client'
import {
  NAME_SCHEME_OPTIONS,
  effectiveNameScheme,
  isNameScheme,
  isSchemeLocked,
  lockedSchemeNotice,
  nameSchemeForRequest,
  nameSchemeWord,
  systemNameLimitsText,
  type NameScheme,
} from '@/lib/principal-name-scheme'

/**
 * Name-scheme choice for creating a principal. Defaults to the org default
 * (manage-gated read; creators are managers/owners). `requestScheme` is what to
 * send as `nameScheme` — undefined when the org locks the scheme or the
 * creator kept the default.
 */
export function usePrincipalNameScheme(orgId: string) {
  const canManage = useCan('organization', orgId, 'organization:manage')
  const [choice, setChoice] = useState<NameScheme | null>(null)
  const query = useQuery({
    queryKey: queryKeys.org(orgId).settings.principalDefaults,
    queryFn: () => fetchOrgPrincipalDefaults(orgId),
    enabled: canManage && orgId.length > 0,
  })
  const defaults = query.data
  const locked = isSchemeLocked(defaults)
  const orgScheme = effectiveNameScheme(defaults)
  const selected = locked ? orgScheme : (choice ?? orgScheme)
  return {
    selected,
    locked,
    orgScheme,
    setChoice,
    requestScheme: nameSchemeForRequest(choice, defaults),
    reset: () => setChoice(null),
  }
}

export function PrincipalNameSchemeField({
  scheme,
  disabled = false,
}: Readonly<{
  scheme: ReturnType<typeof usePrincipalNameScheme>
  disabled?: boolean
}>) {
  if (scheme.locked) {
    return <Text style={panelStyles.muted}>{lockedSchemeNotice(scheme.orgScheme)}</Text>
  }
  return (
    <FormField
      label="Name scheme"
      hint={`${systemNameLimitsText(scheme.selected)} Org default: ${nameSchemeWord(scheme.orgScheme)}.`}
    >
      <Select
        value={scheme.selected}
        options={NAME_SCHEME_OPTIONS}
        placeholder="Select a name scheme"
        disabled={disabled}
        accessibilityLabel="Name scheme"
        onChange={(value) => {
          if (isNameScheme(value)) scheme.setChoice(value)
        }}
      />
    </FormField>
  )
}
