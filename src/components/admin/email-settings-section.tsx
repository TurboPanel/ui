import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  LoadingState,
  SectionPanel,
  SegmentedControl,
} from '@/components/ui'
import type {
  EmailSettingSource,
  EmailSettingsResponse,
} from '@/lib/instance-api'
import { useEmailSettings, useSaveEmailSettings } from '@/lib/queries/admin'
import { colors, spacing } from '@/lib/theme'

function LockIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" fill="none">
      <Rect
        x={2.75}
        y={6.25}
        width={8.5}
        height={5.5}
        rx={1.5}
        stroke={colors.textMuted}
        strokeWidth={1.25}
      />
      <Path
        d="M4.75 6V4.5a2.25 2.25 0 0 1 4.5 0V6"
        stroke={colors.textMuted}
        strokeWidth={1.25}
        strokeLinecap="round"
      />
    </Svg>
  )
}

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

const PROVIDER_SEGMENT_OPTIONS = PROVIDER_OPTIONS.map((value) => ({
  value,
  label: PROVIDER_LABELS[value],
}))

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

export function EmailSettingsSection() {
  const emailQuery = useEmailSettings()
  const saveMutation = useSaveEmailSettings()

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
        nextDraft[k] = isSecretKey(k) ? '' : (entry.value ?? '')
      } else if (isSecretKey(k) && entry.value === '***') {
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
    saveMutation.mutate(payload, {
      onSuccess: (res) => {
        applyServerResponse(res)
        setSuccess('Settings saved.')
        setSaveError(null)
      },
      onError: () => {
        setSaveError(saveMutation.actionError ?? 'Failed to save email settings')
        setSuccess(null)
      },
    })
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
      sourceBadge = <Badge label="Set by environment" tone="pending" />
    } else if (isDb) {
      sourceBadge = <Badge label="Saved" tone="ok" />
    }

    let fieldControl: ReactNode
    if (isProvider) {
      fieldControl = (
        <SegmentedControl
          options={PROVIDER_SEGMENT_OPTIONS}
          value={value === 'mailgun' ? 'mailgun' : 'smtp'}
          disabled={isEnv || saveMutation.isPending}
          onChange={(opt) => {
            if (isEnv || saveMutation.isPending) return
            onProviderChange(opt)
          }}
          accessibilityLabel="Email provider"
        />
      )
    } else if (isEnv) {
      fieldControl = (
        <View style={[styles.input, styles.inputDisabled, styles.lockRow]}>
          <LockIcon />
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
      <Text style={panelStyles.pageTitle}>Email</Text>
      <Text style={panelStyles.pageCopy}>
        Configure the email provider used for system notifications. Settings stored in the
        database can be edited here. Environment variables take precedence and appear read-only.
      </Text>

      <SectionPanel
        title="Email settings"
        hint="Provider selection and credentials for SMTP or Mailgun API"
      >
        {emailQuery.isError ? (
          <Text style={panelStyles.error}>
            {emailQuery.error instanceof Error
              ? emailQuery.error.message
              : 'Failed to load email settings'}
          </Text>
        ) : null}
        {saveError ? <Text style={panelStyles.error}>{saveError}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        {emailQuery.isLoading ? (
          <LoadingState />
        ) : (
          <>
            {visibleKeysForProvider(
              draft.TURBOPANEL_SYSTEM_EMAIL__PROVIDER ||
                loaded.TURBOPANEL_SYSTEM_EMAIL__PROVIDER.value ||
                'smtp',
            ).map((k) => renderField(k))}

            <Button
              label="Save"
              busyLabel="Saving..."
              variant="primary"
              busy={saveMutation.isPending}
              onPress={() => onSave()}
            />

            <Text style={panelStyles.muted}>
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
  input: {
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.bgInput,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderRadius: 8,
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
  lockValue: {
    color: colors.textMuted,
    fontSize: 16,
    flex: 1,
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
  success: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
})
