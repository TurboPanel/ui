import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  Badge,
  Button,
  InlineNotice,
  LoadingState,
  SectionPanel,
  SegmentedControl,
  Select,
} from '@/components/ui'
import type { EmailSettingSource, EmailSettingsResponse } from '@/lib/instance-api'
import {
  effectiveEmailProvider,
  emailDeliveryNotice,
  emailProviderSegmentValue,
  SMTP_ENCRYPTION_HELP,
  SMTP_ENCRYPTION_NONE_WARNING,
  SMTP_ENCRYPTION_OPTIONS,
  smtpEncryptionLabel,
  smtpEncryptionValue,
} from '@/lib/email-settings-view'
import { useEmailSettings, useSaveEmailSettings } from '@/lib/queries/admin'
import { useInstallStatusQuery } from '@/lib/queries/auth'
import { colors, spacing } from '@/lib/theme'
import { userErrorMessage } from '@/lib/user-error'
import { NO_AUTOFILL, secretAutoComplete } from '@/lib/field-autofill'

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

const ENCRYPTION_KEY = 'TURBOPANEL_SYSTEM_EMAIL__SMTP_SECURITY'

const FULL_KEYS = [
  'TURBOPANEL_SYSTEM_EMAIL__PROVIDER',
  'TURBOPANEL_SYSTEM_EMAIL__FROM',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_SECURITY',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_USER',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN',
  'TURBOPANEL_SYSTEM_EMAIL__MAILPIT_API_URL',
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
  TURBOPANEL_SYSTEM_EMAIL__SMTP_SECURITY: 'Encryption',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_USER: 'SMTP user',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS: 'SMTP password',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY: 'Mailgun API key',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN: 'Mailgun domain',
  TURBOPANEL_SYSTEM_EMAIL__MAILPIT_API_URL: 'Mailpit API URL',
}

const PLACEHOLDERS: Record<FullKey, string> = {
  TURBOPANEL_SYSTEM_EMAIL__PROVIDER: 'smtp',
  TURBOPANEL_SYSTEM_EMAIL__FROM: 'noreply@example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST: 'smtp.example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT: '587',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_SECURITY: 'auto',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_USER: 'user@example.com',
  TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS: '',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY: '',
  TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN: 'mg.example.com',
  TURBOPANEL_SYSTEM_EMAIL__MAILPIT_API_URL: 'https://mailpit:8025',
}

const PROVIDER_OPTIONS: ('smtp' | 'mailgun')[] = ['smtp', 'mailgun']

const PROVIDER_LABELS: Record<(typeof PROVIDER_OPTIONS)[number], string> = {
  smtp: 'SMTP',
  mailgun: 'Mailgun API',
}

// Every provider value the backend can resolve from env, including ones
// never offered as a choosable option below (Mailpit is an env-only
// integration-test wire, never something an operator picks by hand) — used
// only to give the locked "Set by environment" display a friendly label
// instead of the raw env value.
const PROVIDER_DISPLAY_LABELS: Record<string, string> = {
  ...PROVIDER_LABELS,
  'mailpit-api': 'Mailpit (HTTP API)',
  'mailpit-smtp': 'Mailpit (SMTP)',
}

const PROVIDER_SEGMENT_OPTIONS = PROVIDER_OPTIONS.map((value) => ({
  value,
  label: PROVIDER_LABELS[value],
}))

const SMTP_KEYS: FullKey[] = [
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_HOST',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PORT',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_SECURITY',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_USER',
  'TURBOPANEL_SYSTEM_EMAIL__SMTP_PASS',
]

const MAILGUN_KEYS: FullKey[] = [
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_API_KEY',
  'TURBOPANEL_SYSTEM_EMAIL__MAILGUN_DOMAIN',
]

const MAILPIT_KEYS: FullKey[] = ['TURBOPANEL_SYSTEM_EMAIL__MAILPIT_API_URL']

const BASE_KEYS: FullKey[] = ['TURBOPANEL_SYSTEM_EMAIL__PROVIDER', 'TURBOPANEL_SYSTEM_EMAIL__FROM']

function visibleKeysForProvider(provider: string): FullKey[] {
  if (provider === 'mailgun') return [...BASE_KEYS, ...MAILGUN_KEYS]
  if (provider === 'mailpit-api') return [...BASE_KEYS, ...MAILPIT_KEYS]
  return [...BASE_KEYS, ...SMTP_KEYS]
}

function isSecretKey(key: FullKey): boolean {
  return SECRET_KEYS.has(key)
}

function envVarName(full: FullKey): string {
  return full
}

function SourceBadge({ source }: Readonly<{ source: EmailSettingSource }>) {
  if (source === 'env') return <Badge label="Set by environment" tone="pending" />
  if (source === 'db') return <Badge label="Saved" tone="ok" />
  return null
}

/** What a locked (environment-controlled) field shows: secrets masked, the provider by its friendly name. */
function lockedDisplayText(key: FullKey, value: string): string {
  if (isSecretKey(key)) return '••••••••'
  if (key === ENCRYPTION_KEY) return smtpEncryptionLabel(value)
  const displayValue =
    key === 'TURBOPANEL_SYSTEM_EMAIL__PROVIDER' ? (PROVIDER_DISPLAY_LABELS[value] ?? value) : value
  return displayValue || ''
}

const EMAIL_SETTINGS_PANEL_ID = 'email-settings-panel'

/** "Set Up Email": bring the settings form into view (web; a no-op elsewhere). */
function scrollToSettings() {
  if (globalThis.document === undefined) return
  globalThis.document.getElementById(EMAIL_SETTINGS_PANEL_ID)?.scrollIntoView?.({
    behavior: 'smooth',
    block: 'start',
  })
}

function FieldNotes({
  fieldKey,
  value,
  isEnv,
  isDefault,
}: Readonly<{ fieldKey: FullKey; value: string; isEnv: boolean; isDefault: boolean }>) {
  const isEncryption = fieldKey === ENCRYPTION_KEY
  return (
    <>
      {isEnv ? (
        <Text style={styles.help}>
          This setting is controlled by the {envVarName(fieldKey)} environment variable and cannot
          be changed here.
        </Text>
      ) : null}

      {isEncryption ? <Text style={styles.help}>{SMTP_ENCRYPTION_HELP}</Text> : null}

      {isEncryption && smtpEncryptionValue(value) === 'none' ? (
        <InlineNotice
          tone="warning"
          title="Unencrypted Email"
          body={SMTP_ENCRYPTION_NONE_WARNING}
        />
      ) : null}

      {isDefault && !isEncryption ? (
        <Text style={styles.helpMuted}>Using default value.</Text>
      ) : null}
    </>
  )
}

export function EmailSettingsSection() {
  const emailQuery = useEmailSettings()
  const saveMutation = useSaveEmailSettings()
  const statusQuery = useInstallStatusQuery()
  // Of the choosable providers, Workers can only send through Mailgun's API
  // — nodemailer's SMTP transport needs a raw TCP socket, which the Workers
  // runtime does not provide, and `smtp` there silently resolves to a noop
  // queue (turbopanel src/features/email/AGENTS.md). `mailpit-api` (an
  // HTTP-based, Workers-capable path) also exists but is env-only, wired for
  // integration testing, and never offered as something an operator picks
  // here — offering `smtp`, or the host/port/user/password fields it needs,
  // would just be a dead end.
  const isWorkers = statusQuery.data?.runtime === 'workers'
  const providerSegmentOptions = isWorkers
    ? PROVIDER_SEGMENT_OPTIONS.filter((opt) => opt.value === 'mailgun')
    : PROVIDER_SEGMENT_OPTIONS

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
  const [loaded, setLoaded] = useState<
    Record<FullKey, { value: string | null; source: EmailSettingSource }>
  >(() => {
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

  // Keyed on the settings only: a read that changes just the delivery report
  // (the refetch after a save) keeps the same reference and leaves the form alone.
  const loadedSettings = emailQuery.data?.settings
  useEffect(() => {
    if (loadedSettings) {
      applyServerResponse({ ok: true, settings: loadedSettings })
    }
  }, [loadedSettings])

  const deliveryNotice = emailDeliveryNotice(emailQuery.data?.delivery)

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

      if (
        key === ENCRYPTION_KEY &&
        smtpEncryptionValue(current) === smtpEncryptionValue(loadedEntry.value)
      ) {
        // Unchanged (or an older control plane that has no such setting): send nothing.
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
    const isDefault = source === 'default'
    const value = draft[key] ?? ''
    const isSecret = isSecretKey(key)
    const label = LABELS[key]
    const placeholder = PLACEHOLDERS[key]
    const isProvider = key === 'TURBOPANEL_SYSTEM_EMAIL__PROVIDER'

    let fieldControl: ReactNode
    if (isProvider && !isEnv) {
      // Only reached when the operator can actually pick a provider —
      // an env-set value (including a Mailpit provider, never offered as a
      // choosable option) falls through to the generic locked-text display
      // below instead, same as every other env-controlled field.
      fieldControl = (
        <SegmentedControl
          options={providerSegmentOptions}
          value={emailProviderSegmentValue(isWorkers, value)}
          disabled={isWorkers || saveMutation.isPending}
          onChange={(opt) => {
            onProviderChange(opt)
          }}
          accessibilityLabel="Email provider"
        />
      )
    } else if (key === ENCRYPTION_KEY && !isEnv) {
      fieldControl = (
        <Select
          value={smtpEncryptionValue(value)}
          options={SMTP_ENCRYPTION_OPTIONS}
          placeholder="Auto"
          disabled={saveMutation.isPending}
          accessibilityLabel="SMTP encryption"
          onChange={(next) => onChange(key, next ?? 'auto')}
        />
      )
    } else if (isEnv) {
      fieldControl = (
        <View style={[styles.input, styles.inputDisabled, styles.lockRow]}>
          <LockIcon />
          <Text style={styles.lockValue} numberOfLines={1}>
            {lockedDisplayText(key, value)}
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
          autoComplete={isSecret ? secretAutoComplete() : NO_AUTOFILL}
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
          <SourceBadge source={source} />
        </View>

        {fieldControl}

        <FieldNotes fieldKey={key} value={value} isEnv={isEnv} isDefault={isDefault} />
      </View>
    )
  }

  const provider = effectiveEmailProvider({
    providerSource: sources.TURBOPANEL_SYSTEM_EMAIL__PROVIDER,
    isWorkers,
    loadedValue: loaded.TURBOPANEL_SYSTEM_EMAIL__PROVIDER.value,
    draftValue: draft.TURBOPANEL_SYSTEM_EMAIL__PROVIDER,
  })

  return (
    <View style={styles.root}>
      <Text style={panelStyles.pageTitle}>Email</Text>
      <Text style={panelStyles.pageCopy}>
        Configure the email provider used for system notifications. Settings stored in the database
        can be edited here. Environment variables take precedence and appear read-only.
      </Text>

      {deliveryNotice ? (
        <InlineNotice
          tone="warning"
          title={deliveryNotice.title}
          body={deliveryNotice.body}
          actions={
            deliveryNotice.setUp ? (
              <Button label="Set Up Email" size="sm" onPress={scrollToSettings} />
            ) : null
          }
        />
      ) : null}

      <View nativeID={EMAIL_SETTINGS_PANEL_ID}>
        <SectionPanel
          title="Email settings"
          hint="Provider selection and credentials for SMTP or Mailgun API"
        >
          {emailQuery.isError ? (
            <Text style={panelStyles.error}>
              {userErrorMessage(emailQuery.error, 'Failed to load email settings')}
            </Text>
          ) : null}
          {saveError ? <Text style={panelStyles.error}>{saveError}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          {emailQuery.isLoading ? (
            <LoadingState />
          ) : (
            <>
              {visibleKeysForProvider(provider).map((k) => renderField(k))}

              <Button
                label="Save"
                busyLabel="Saving..."
                variant="primary"
                busy={saveMutation.isPending}
                onPress={() => onSave()}
              />

              <Text style={panelStyles.muted}>
                Only fields not overridden by environment variables are sent on save. Clear a field
                to remove its stored value and fall back to defaults.
              </Text>
            </>
          )}
        </SectionPanel>
      </View>
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
    color: colors.ok,
    fontSize: 13,
    fontWeight: '600',
  },
})
