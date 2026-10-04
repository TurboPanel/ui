import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { GeoLocationLines } from '@/components/org/geo-location-lines'
import { panelStyles } from '@/components/ui/panel-styles'
import { Button, ButtonRow, SectionPanel, TextField } from '@/components/ui'
import type {
  LocationField,
  LocationPatch,
  ResolvedLocation,
  ServerGeo,
} from '@/lib/instance-api'
import {
  buildLocationPatch,
  clearFieldPatch,
  detectedFieldText,
  isCustomLocation,
  isFieldOverridden,
  LOCATION_FIELD_LABELS,
  LOCATION_FIELDS,
  locationDisplayGeo,
  locationDraftFrom,
  locationErrorField,
  readResolvedLocation,
  type LocationDraft,
} from '@/lib/location'
import { formatServerGeoPlace } from '@/lib/server-geo'
import { spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'

function errorMessage(err: unknown, fallback: string): string {
  return userErrorMessage(err, fallback)
}

const FIELD_HINTS: Partial<Record<LocationField, string>> = {
  country: 'Two-letter code, e.g. US.',
  asn: 'e.g. 13335 or AS13335.',
}

/**
 * Location for a server or datacenter: Cloudflare's detected values by
 * default, any field editable, per-field "Use detected" and a full reset.
 * `onSave` sends the PATCH `location` body (`null` resets every field).
 */
export function LocationEditorPanel({
  subject,
  location,
  detectedGeo,
  canManage,
  onSave,
}: Readonly<{
  /** "server" or "datacenter", for labels. */
  subject: string
  location: ResolvedLocation | null | undefined
  /** Raw detected geo, used when the control plane predates `location`. */
  detectedGeo: ServerGeo | null | undefined
  canManage: boolean
  onSave: (patch: LocationPatch | null) => Promise<unknown>
}>) {
  const initial = locationDraftFrom(location, detectedGeo)
  const [draft, setDraft] = useState<Partial<LocationDraft>>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<{ field: LocationField; message: string } | null>(
    null,
  )
  const editable = canManage && readResolvedLocation(location) !== null
  const current: LocationDraft = { ...initial, ...draft }
  const custom = isCustomLocation(location)
  const changes = buildLocationPatch(initial, current)
  const displayGeo = locationDisplayGeo(location, detectedGeo)
  const place = formatServerGeoPlace(displayGeo)
  const summary = [place || 'Not detected yet', custom ? 'edited' : ''].filter(Boolean).join(' · ')

  const send = async (patch: LocationPatch | null) => {
    setError(null)
    setFieldError(null)
    setPending(true)
    try {
      await onSave(patch)
      setDraft({})
    } catch (err) {
      const field = locationErrorField(err)
      if (field) {
        setFieldError({ field, message: `Enter a valid ${LOCATION_FIELD_LABELS[field].toLowerCase()}.` })
      } else {
        setError(errorMessage(err, 'Failed to save location'))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <SectionPanel
      title="Location"
      hint={summary}
      collapsible
      defaultCollapsed
    >
      <GeoLocationLines geo={displayGeo} custom={custom} />
      <Text style={panelStyles.muted}>
        Cloudflare fills this in from the connection; edit any field to override it.
      </Text>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}

      {editable ? (
        <View style={styles.form}>
          {LOCATION_FIELDS.map((field) => {
            const detected = detectedFieldText(location, detectedGeo, field)
            const overridden = isFieldOverridden(location, field)
            const hintParts = [
              detected ? `Detected: ${detected}` : 'Nothing detected',
              FIELD_HINTS[field] ?? '',
            ].filter(Boolean)
            return (
              <TextField
                key={field}
                label={LOCATION_FIELD_LABELS[field]}
                labelRight={
                  overridden ? (
                    <Button
                      label="Use detected"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onPress={() => {
                        void send(clearFieldPatch(field))
                      }}
                      accessibilityLabel={`Use the detected ${LOCATION_FIELD_LABELS[field].toLowerCase()} for this ${subject}`}
                    />
                  ) : undefined
                }
                value={current[field]}
                onChangeText={(value) => {
                  setDraft((prev) => ({ ...prev, [field]: value }))
                }}
                placeholder={detected || undefined}
                editable={!pending}
                autoCapitalize={field === 'country' ? 'characters' : 'words'}
                keyboardType={field === 'asn' ? 'default' : undefined}
                hint={hintParts.join(' · ')}
                error={fieldError?.field === field ? fieldError.message : null}
                accessibilityLabel={`${subject} location ${LOCATION_FIELD_LABELS[field].toLowerCase()}`}
              />
            )
          })}
          <Text style={panelStyles.muted}>
            Empty a field to go back to the detected value.
          </Text>
          <ButtonRow>
            <Button
              label="Save location"
              variant="primary"
              busy={pending}
              disabled={pending || changes === null}
              onPress={() => {
                if (changes) void send(changes)
              }}
            />
            {custom ? (
              <Button
                label="Reset to detected"
                variant="secondary"
                disabled={pending}
                onPress={() => {
                  void send(null)
                }}
              />
            ) : null}
          </ButtonRow>
        </View>
      ) : null}
      {!canManage ? <Text style={panelStyles.muted}>Manage permission required to edit.</Text> : null}
      {canManage && !editable ? (
        <Text style={panelStyles.muted}>
          This control plane does not support editing locations yet.
        </Text>
      ) : null}
    </SectionPanel>
  )
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
})
