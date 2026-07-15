import { useEffect, useState, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useAuth } from '@/lib/auth-context'
import {
  fetchEmailSettings,
  isForbiddenError,
  saveEmailSettings,
  type EmailSettingSource,
  type EmailSettingsResponse,
} from '@/lib/instance-api'
import { useForbiddenRecovery } from '@/lib/query-client'
import { colors, spacing } from '@/lib/theme'

const FULL_KEYS = [
  'TURBOPANEL_SYSTEM_EMAIL__PROVIDER',
  'TURBOPANEL_SYSTEM_EMAIL__FROM',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_USER',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN',
] as const

type FullKey = (typeof FULL_KEYS)[number]

const SECRET_KEYS: ReadonlySet<FullKey> = new Set([
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY',
])

const LABELS: Record<FullKey, string> = {
  TURBOPANEL_SYSTEM_EMAIL__PROVIDER: 'Provider',
  TURBOPANEL_SYSTEM_EMAIL__FROM: 'From address',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST: 'SMTP host',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT: 'SMTP port',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_USER: 'SMTP user',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS: 'SMTP password',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY: 'Mailgun API key',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN: 'Mailgun domain',
}

const PLACEHOLDERS: Record<FullKey, string> = {
  TURBOPANEL_SYSTEM_EMAIL__PROVIDER: 'smtp',
  TURBOPANEL_SYSTEM_EMAIL__FROM: 'noreply@example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST: 'smtp.example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT: '587',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_USER: 'user@example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS: '',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY: '',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN: 'mg.example.com',
}

const PROVIDER_OPTIONS: ('smtp' | 'mailgun')[] = ['smtp', 'mailgun']

const PROVIDER_LABELS: Record<(typeof PROVIDER_OPTIONS)[number], string> = {
  smtp: 'SMTP',
  mailgun: 'Mailgun API',
}

const SMTP_KEYS: FullKey[] = [
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_USER',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS',
]

const MAILGUN_KEYS: FullKey[] = [
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN',
]

const BASE_KEYS: FullKey[] = [
  'TURBOPANEL_SYSTEM_EMAIL__PROVIDER',
  'TURBOPANEL_SYSTEM_EMAIL__FROM',
]

function visibleKeysForProvider(provider: string): FullKey[] {
  const resolved = provider === 'mailgun' ? 'mailgun' : 'smtp'
  return resolved === 'mailgun'
    ? [...BASE_KEYS, ...MAILGUN_KEYS]
    : [...BASE_KEYS, ...SMTP_KEYS]
}

function isSecretKey(key: FullKey): boolean {
  return SECRET_KEYS.has(key)
}

function envVarName(full: FullKey): string {
  return full
}

const emailSettingsQueryKey = ['admin', 'email-settings'] as const

export function EmailSettingsSection() {
  const { handleUnauthorized } = useAuth()
  const queryClient = useQueryClient()

  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [sources, setSources] = useState<Record<FullKey, EmailSettingSource>>(() => {
    const init = {} as Record<FullKey, EmailSettingSource>
    for (const k of FULL_KEYS) init[k] = 'default'
    return init
  })

  // Current draft values for inputs (strings). For secrets loaded as '***' we keep '' until touched.
  const [draft, setDraft] = useState<Record<FullKey, string>>(() => {
    const init = {} as Record<FullKey, string>
    for (const k of FULL_KEYS) init[k] = ''
    return init
  })

  // Track which secret fields have been explicitly edited by the user (so we know to send the value even if it looks empty now).
  const [secretTouched, setSecretTouched] = useState<Record<FullKey, boolean>>(() => {
    const init = {} as Record<FullKey, boolean>
    for (const k of FULL_KEYS) init[k] = false
    return init
  })

  // Snapshot of the last loaded server shape (for computing payload and badges).
  const [loaded, setLoaded] = useState<Record<FullKey, { value: string | null; source: EmailSettingSource }>>(() => {
    const init = {} as Record<FullKey, { value: string | null; source: EmailSettingSource }>
    for (const k of FULL_KEYS) init[k] = { value: null, source: 'default' }
    return init
  })

  const emailQuery = useQuery({
    queryKey: emailSettingsQueryKey,
    queryFn: fetchEmailSettings,
  })

  useForbiddenRecovery(emailQuery.error)

  const applyServerResponse = (res: EmailSettingsResponse) => {
    const nextSources = {} as Record<FullKey, EmailSettingSource>
    const nextDraft = {} as Record<FullKey, string>
    const nextLoaded = {} as Record<FullKey, { value: string | null; source: EmailSettingSource }>
    const nextTouched = {} as Record<FullKey, boolean>

    for (const k of FULL_KEYS) {
      const entry = res.settings[k] ?? { value: null, source: 'default' as const }
      nextSources[k] = entry.source
      nextLoaded[k] = { value: entry.value, source: entry.source }
      nextTouched[k] = false

      if (entry.source === 'env') {
        // Preserve resolved value for non-secrets so admins can see the effective setting.
        // Secrets from env are never sent by the API; use a masked placeholder on render.
        nextDraft[k] = isSecretKey(k) ? '' : (entry.value ?? '')
      } else if (isSecretKey(k) && entry.value === '***') {
        // Show masked; do not put literal '***' into the editable draft until user types.
        nextDraft[k] = ''
      } else {
        nextDraft[k] = entry.value ?? ''
      }
    }

    setSources(nextSources)
    setDraft(nextDraft)
    setLoaded(nextLoaded)
    setSecretTouched(nextTouched)
  }

  useEffect(() => {
    if (emailQuery.data) {
      applyServerResponse(emailQuery.data)
    }
  }, [emailQuery.data])

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string | null>) => {
      return await saveEmailSettings(payload)
    },
    onSuccess: (res) => {
      queryClient.setQueryData(emailSettingsQueryKey, res)
      applyServerResponse(res)
      setSuccess('Settings saved.')
      setSaveError(null)
    },
    onError: async (err) => {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        setSaveError(err instanceof Error ? err.message : 'Access denied')
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save email settings')
      }
      setSuccess(null)
    },
  })

  const onChange = (key: FullKey, text: string) => {
    setDraft((prev) => ({ ...prev, [key]: text }))
    setSuccess(null)
    setSaveError(null)
    if (isSecretKey(key) && !secretTouched[key]) {
      // Mark as touched on first change so we will include it on save (even if cleared).
      setSecretTouched((prev) => ({ ...prev, [key]: true }))
    }
  }

  const onProviderChange = (value: 'smtp' | 'mailgun') => {
    const key: FullKey = 'TURBOPANEL_SYSTEM_EMAIL__PROVIDER'
    onChange(key, value)
  }

  const buildSavePayload = (): Record<string, string | null> => {
    const payload: Record<string, string | null> = {}
    for (const key of FULL_KEYS) {
      const src = sources[key]
      if (src === 'env') continue

      const isSecret = isSecretKey(key)
      const loadedEntry = loaded[key]
      const current = draft[key] ?? ''

      if (isSecret) {
        const wasMasked = loadedEntry.value === '***'
        const touched = secretTouched[key]
        if (wasMasked && !touched) {
          // Do not send — preserves existing secret.
          continue
        }
        // If user cleared it (or set to something), send null for empty to clear, else the value.
        payload[key] = current.trim() === '' ? null : current
        continue
      }

      // Non-secret: empty means clear (null), otherwise the trimmed value.
      payload[key] = current.trim() === '' ? null : current
    }
    return payload
  }

  const onSave = () => {
    setSuccess(null)
    setSaveError(null)
    const payload = buildSavePayload()
    saveMutation.mutate(payload)
  }

  const renderField = (key: FullKey) => {
    const source = sources[key]
    const isEnv = source === 'env'
    const isDb = source === 'db'
    const isDefault = source === 'default'
    const value = draft[key] ?? ''
    const isSecret = isSecretKey(key)
    const label = LABELS[key]
    const placeholder = PLACEHOLDERS[key]
    const envName = envVarName(key)
    const isProvider = key === 'TURBOPANEL_SYSTEM_EMAIL__PROVIDER'

    let sourceBadge: ReactNode = null
    if (isEnv) {
      sourceBadge = (
        <View style={[styles.badge, styles.badgeEnv]}>
          <Text style={styles.badgeTextEnv}>Set by environment</Text>
        </View>
      )
    } else if (isDb) {
      sourceBadge = (
        <View style={[styles.badge, styles.badgeDb]}>
          <Text style={styles.badgeTextDb}>Saved</Text>
        </View>
      )
    }

    let fieldControl: ReactNode
    if (isProvider) {
      fieldControl = (
        <View style={styles.chipRow}>
          {PROVIDER_OPTIONS.map((opt) => {
            const selected = (value || 'smtp') === opt
            return (
              <Pressable
                key={opt}
                style={[styles.chip, selected && styles.chipActive]}
                onPress={isEnv || saveMutation.isPending ? undefined : () => onProviderChange(opt)}
                disabled={isEnv || saveMutation.isPending}
              >
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {PROVIDER_LABELS[opt]}
                </Text>
              </Pressable>
            )
          })}
        </View>
      )
    } else if (isEnv) {
      fieldControl = (
        <View style={[styles.input, styles.inputDisabled, styles.lockRow]}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockValue} numberOfLines={1}>
            {isSecret ? '••••••••' : (value || '')}
          </Text>
        </View>
      )
    } else {
      fieldControl = (
        <TextInput
          value={value}
          onChangeText={(t) => onChange(key, t)}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          secureTextEntry={isSecret}
          style={styles.input}
          editable={!saveMutation.isPending}
        />
      )
    }

    return (
      <View key={key} style={styles.field}>
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {sourceBadge}
        </View>

        {fieldControl}

        {isEnv ? (
          <Text style={styles.help}>
            This setting is controlled by the {envName} environment variable and cannot be changed here.
          </Text>
        ) : null}

        {isDefault ? (
          <Text style={styles.helpMuted}>Using default value.</Text>
        ) : null}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>Email</Text>
      <Text style={styles.copy}>
        Configure the email provider used for system notifications. Settings stored in the
        database can be edited here. Environment variables take precedence and appear read-only.
      </Text>

      <SectionPanel
        title="Email settings"
        hint="Provider selection and credentials for SMTP or Mailgun API"
      >
        {emailQuery.isError ? (
          <Text style={orgPanelStyles.error}>
            {emailQuery.error instanceof Error
              ? emailQuery.error.message
              : 'Failed to load email settings'}
          </Text>
        ) : null}
        {saveError ? <Text style={orgPanelStyles.error}>{saveError}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        {emailQuery.isLoading ? (
          <Text style={orgPanelStyles.muted}>Loading...</Text>
        ) : (
          <>
            {visibleKeysForProvider(
              draft.TURBOPANEL_SYSTEM_EMAIL__PROVIDER ||
                loaded.TURBOPANEL_SYSTEM_EMAIL__PROVIDER.value ||
                'smtp',
            ).map((k) => renderField(k))}

            <View style={styles.actions}>
              <Pressable
                style={[styles.primaryButton, saveMutation.isPending && styles.buttonDisabled]}
                disabled={saveMutation.isPending}
                onPress={() => onSave()}
              >
                <Text style={styles.primaryButtonText}>
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Text>
              </Pressable>
            </View>

            <Text style={orgPanelStyles.muted}>
              Only fields not overridden by environment variables are sent on save.
              Clear a field to remove its stored value and fall back to defaults.
            </Text>
          </>
        )}
      </SectionPanel>
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
  field: {
    gap: 6,
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  label: {
    color: colors.textBody,
    fontSize: 13,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeEnv: {
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.pending,
  },
  badgeDb: {
    backgroundColor: colors.bgActive,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  badgeTextEnv: {
    color: colors.pending,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  badgeTextDb: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
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
  inputDisabled: {
    backgroundColor: colors.bgInset,
    color: colors.textMuted,
    borderColor: colors.borderArea,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lockIcon: {
    fontSize: 14,
  },
  lockValue: {
    color: colors.textMuted,
    fontSize: 16,
    flex: 1,
  },
  lockText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  help: {
    color: colors.textFaint,
    fontSize: 12,
    lineHeight: 16,
  },
  helpMuted: {
    color: colors.textFaint,
    fontSize: 12,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  chipText: {
    color: colors.textChip,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  success: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
})
