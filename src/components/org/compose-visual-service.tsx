import { createElement, useEffect, useState, type CSSProperties } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import {
  formatComposeImageRef,
  parseComposeImageRef,
  patchComposeImageRef,
  type ComposeImageRef,
} from '@/lib/compose/image-ref'
import {
  addableVisualFields,
  COMPOSE_RESTART_POLICIES,
  formatComposeRestart,
  parseComposeRestart,
  serviceHasVisualField,
  visualFieldById,
  type ComposeRestartPolicy,
  type VisualFieldDef,
} from '@/lib/compose/visual-fields'
import {
  isTraditionalWebComposeService,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  TRADITIONAL_WEB_ENGINE_OPTIONS,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
  type TraditionalWebEngine,
} from '@/lib/compose/service-kind'
import { colors, spacing } from '@/lib/theme'

const webSelectStyle: CSSProperties = {
  width: '100%',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.border,
  borderRadius: 6,
  backgroundColor: colors.bgInput,
  color: colors.text,
  fontFamily: 'monospace',
  fontSize: 13,
  padding: 10,
  minHeight: 40,
}

const RESTART_OPTION_LABELS: Record<ComposeRestartPolicy, string> = {
  no: 'no — never restart',
  always: 'always — restart until removed',
  'on-failure': 'on-failure — restart on error exit',
  'unless-stopped': 'unless-stopped — restart unless manually stopped',
}

function servicePorts(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(', ') : ''
}

function traditionalWebEngineHint(
  engine: TraditionalWebEngine | undefined,
): string {
  if (engine === 'openlitespeed') {
    return 'Files are served from the host document root via OpenLiteSpeed (static only — no PHP or web-env injection); hosting Caddy terminates TLS. Pair with Apache on a path prefix when you need PHP.'
  }
  if (engine === 'apache') {
    return 'Files are served from the host document root via Apache (mod_php + SetEnv when hosting PHP/web.env options are set); hosting Caddy terminates TLS.'
  }
  return 'Files are served from the host document root via nginx (static; PHP settings ignored — use Apache for mod_php); hosting Caddy terminates TLS.'
}

function OptionSelect({
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  disabled: boolean
  onChange: (value: string) => void
}>) {
  if (Platform.OS === 'web') {
    return createElement(
      'select',
      {
        value,
        disabled,
        onChange: (event: { target: { value: string } }) => {
          onChange(event.target.value)
        },
        style: webSelectStyle,
      },
      options.map((option) =>
        createElement(
          'option',
          { key: option.value, value: option.value },
          option.label,
        ),
      ),
    )
  }

  return (
    <View style={styles.optionList}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            style={[styles.optionChip, selected && styles.optionChipActive]}
            disabled={disabled}
            onPress={() => onChange(option.value)}
          >
            <Text
              style={[
                styles.optionChipText,
                selected && styles.optionChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function FieldHeader({
  label,
  onRemove,
  disabled,
}: Readonly<{
  label: string
  onRemove: () => void
  disabled: boolean
}>) {
  return (
    <View style={styles.fieldHeader}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={onRemove} disabled={disabled}>
        <Text style={styles.removeFieldText}>Remove</Text>
      </Pressable>
    </View>
  )
}

function RestartField({
  value,
  disabled,
  onChange,
  onRemove,
}: Readonly<{
  value: unknown
  disabled: boolean
  onChange: (restart: string) => void
  onRemove: () => void
}>) {
  const parsed = parseComposeRestart(value) ?? {
    policy: 'always' as const,
    maxRetries: null,
  }
  const policyOptions = COMPOSE_RESTART_POLICIES.map((policy) => ({
    value: policy,
    label: RESTART_OPTION_LABELS[policy],
  }))

  return (
    <View style={styles.fieldBlock}>
      <FieldHeader label="Restart" onRemove={onRemove} disabled={disabled} />
      <OptionSelect
        value={parsed.policy}
        options={policyOptions}
        disabled={disabled}
        onChange={(nextPolicy) => {
          if (
            nextPolicy !== 'no' &&
            nextPolicy !== 'always' &&
            nextPolicy !== 'on-failure' &&
            nextPolicy !== 'unless-stopped'
          ) {
            return
          }
          onChange(
            formatComposeRestart(
              nextPolicy,
              nextPolicy === 'on-failure' ? parsed.maxRetries : null,
            ),
          )
        }}
      />
      {parsed.policy === 'on-failure' ? (
        <>
          <Text style={styles.hint}>
            Optional max retries (Compose: on-failure[:max-retries])
          </Text>
          <TextInput
            value={parsed.maxRetries === null ? '' : String(parsed.maxRetries)}
            onChangeText={(text) => {
              const trimmed = text.trim()
              if (trimmed === '') {
                onChange(formatComposeRestart('on-failure', null))
                return
              }
              const next = Number.parseInt(trimmed, 10)
              if (!Number.isFinite(next) || next < 0) {
                return
              }
              onChange(formatComposeRestart('on-failure', next))
            }}
            editable={!disabled}
            keyboardType="number-pad"
            placeholder="unlimited"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
        </>
      ) : null}
    </View>
  )
}

function PortsField({
  value,
  disabled,
  onChange,
  onRemove,
}: Readonly<{
  value: unknown
  disabled: boolean
  onChange: (ports: string[]) => void
  onRemove: () => void
}>) {
  return (
    <View style={styles.fieldBlock}>
      <FieldHeader label="Ports" onRemove={onRemove} disabled={disabled} />
      <TextInput
        value={servicePorts(value)}
        onChangeText={(ports) =>
          onChange(
            ports
              .split(',')
              .map((port) => port.trim())
              .filter(Boolean),
          )
        }
        editable={!disabled}
        placeholder="8080:80, 8443:443"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
    </View>
  )
}

function ImageRefFields({
  value,
  disabled,
  registryOpen,
  onRegistryOpenChange,
  onChange,
}: Readonly<{
  value: unknown
  disabled: boolean
  registryOpen: boolean
  onRegistryOpenChange: (open: boolean) => void
  onChange: (image: string) => void
}>) {
  const ref = parseComposeImageRef(value)
  const composed = formatComposeImageRef(ref)

  const commit = (patch: Partial<ComposeImageRef>) => {
    onChange(formatComposeImageRef(patchComposeImageRef(ref, patch)))
  }

  return (
    <View style={styles.fieldBlock}>
      {registryOpen ? (
        <View style={styles.fieldBlock}>
          <FieldHeader
            label="Registry"
            onRemove={() => {
              onRegistryOpenChange(false)
              commit({ registry: '' })
            }}
            disabled={disabled}
          />
          <TextInput
            value={ref.registry}
            onChangeText={(registry) => commit({ registry })}
            editable={!disabled}
            placeholder="ghcr.io, quay.io, localhost:5000…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>
      ) : null}

      <Text style={styles.label}>Image</Text>
      <TextInput
        value={ref.image}
        onChangeText={(image) => commit({ image })}
        editable={!disabled}
        placeholder="nginx or org/app"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      <Text style={styles.label}>Tag</Text>
      <TextInput
        value={ref.tag}
        onChangeText={(tag) => commit({ tag })}
        editable={!disabled}
        placeholder="latest, alpine, 1.27…"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.input}
      />

      {ref.digest ? (
        <>
          <Text style={styles.label}>Digest</Text>
          <TextInput
            value={ref.digest}
            onChangeText={(digest) => commit({ digest })}
            editable={!disabled}
            placeholder="sha256:…"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </>
      ) : null}

      {composed ? (
        <Text style={styles.hint} selectable>
          image: {composed}
        </Text>
      ) : null}
    </View>
  )
}

export function ComposeVisualServiceCard({
  service,
  nameDraft,
  saving,
  onNameDraftChange,
  onRename,
  onRemoveService,
  onPatchService,
  onClearField,
  onAddField,
}: Readonly<{
  service: Record<string, unknown>
  nameDraft: string
  saving: boolean
  onNameDraftChange: (value: string) => void
  onRename: (nextName: string) => void
  onRemoveService: () => void
  onPatchService: (patch: Record<string, unknown>) => void
  onClearField: (key: string) => void
  onAddField: (field: VisualFieldDef) => void
}>) {
  const parsedImage = parseComposeImageRef(service.image)
  const [registryOpen, setRegistryOpen] = useState(
    () => parsedImage.registry.length > 0,
  )

  useEffect(() => {
    if (parseComposeImageRef(service.image).registry) {
      setRegistryOpen(true)
    }
  }, [service.image])

  const traditional = isTraditionalWebComposeService(service)
  const extension = readServiceTurbopanelExtension(service) ?? {}
  const addable = traditional ? [] : addableVisualFields(service)
  const showRestart =
    !traditional && serviceHasVisualField(service, visualFieldById('restart'))
  const showPorts =
    !traditional && serviceHasVisualField(service, visualFieldById('ports'))
  const showRegistryAdd = !traditional && !registryOpen
  const hasAddChips = addable.length > 0 || showRegistryAdd

  const applyExtension = (
    patch: Parameters<typeof patchServiceTurbopanelExtension>[1],
  ) => {
    const next = patchServiceTurbopanelExtension(service, patch)
    const extensionValue = next[TURBOPANEL_SERVICE_EXTENSION_KEY]
    if (extensionValue === undefined) {
      onClearField(TURBOPANEL_SERVICE_EXTENSION_KEY)
      return
    }
    onPatchService({ [TURBOPANEL_SERVICE_EXTENSION_KEY]: extensionValue })
  }

  const applyKind = (serviceKind: 'container' | 'traditional-web') => {
    if (serviceKind === 'traditional-web') {
      applyExtension({
        serviceKind: 'traditional-web',
        engine: extension.engine ?? 'nginx',
        root: extension.root ?? 'public',
      })
      onClearField('image')
      return
    }
    applyExtension({ serviceKind: 'container' })
    if (typeof service.image !== 'string' || service.image.trim() === '') {
      onPatchService({ image: 'nginx:alpine' })
    }
  }

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.serviceHeader}>
        <TextInput
          value={nameDraft}
          onChangeText={onNameDraftChange}
          onEndEditing={(event) => onRename(event.nativeEvent.text)}
          editable={!saving}
          style={styles.serviceNameInput}
        />
        <Pressable onPress={onRemoveService} disabled={saving}>
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Service kind</Text>
        <OptionSelect
          value={traditional ? 'traditional-web' : 'container'}
          options={[
            { value: 'container', label: 'Container (Docker)' },
            { value: 'traditional-web', label: 'Traditional web (host nginx/Apache/OLS)' },
          ]}
          disabled={saving}
          onChange={(value) => {
            if (value === 'container' || value === 'traditional-web') {
              applyKind(value)
            }
          }}
        />
      </View>

      {traditional ? (
        <>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Web engine</Text>
            <OptionSelect
              value={extension.engine ?? 'nginx'}
              options={TRADITIONAL_WEB_ENGINE_OPTIONS.map((entry) => ({
                value: entry.value,
                label: entry.label,
              }))}
              disabled={saving}
              onChange={(value) => {
                const engine = value as TraditionalWebEngine
                applyExtension({
                  serviceKind: 'traditional-web',
                  engine,
                  root: extension.root ?? 'public',
                })
              }}
            />
            <Text style={styles.hint}>
              {traditionalWebEngineHint(extension.engine)}
            </Text>
          </View>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Document root</Text>
            <TextInput
              value={extension.root ?? 'public'}
              onChangeText={(root) =>
                applyExtension({
                  serviceKind: 'traditional-web',
                  engine: extension.engine ?? 'nginx',
                  root: root.trim() || 'public',
                })
              }
              editable={!saving}
              placeholder="public"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Text style={styles.hint}>
              Relative path under the site directory on the server (default public).
            </Text>
          </View>
        </>
      ) : (
        <ImageRefFields
          value={service.image}
          disabled={saving}
          registryOpen={registryOpen}
          onRegistryOpenChange={setRegistryOpen}
          onChange={(image) => onPatchService({ image })}
        />
      )}

      {showRestart ? (
        <RestartField
          value={service.restart}
          disabled={saving}
          onChange={(restart) => onPatchService({ restart })}
          onRemove={() => onClearField('restart')}
        />
      ) : null}

      {showPorts ? (
        <PortsField
          value={service.ports}
          disabled={saving}
          onChange={(ports) => onPatchService({ ports })}
          onRemove={() => onClearField('ports')}
        />
      ) : null}

      {hasAddChips ? (
        <View style={styles.addRow}>
          <Text style={styles.addLabel}>Add</Text>
          <View style={styles.addChips}>
            {showRegistryAdd ? (
              <Pressable
                style={styles.addChip}
                disabled={saving}
                onPress={() => setRegistryOpen(true)}
              >
                <Text style={styles.addChipText}>Registry</Text>
              </Pressable>
            ) : null}
            {addable.map((field) => (
              <Pressable
                key={field.id}
                style={styles.addChip}
                disabled={saving}
                onPress={() => onAddField(field)}
              >
                <Text style={styles.addChipText}>{field.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  serviceNameInput: {
    color: colors.accent,
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  removeText: { color: colors.errorText, fontSize: 12, fontWeight: '600' },
  removeFieldText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fieldBlock: { gap: 6 },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  optionList: { gap: 6 },
  optionChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.bgActive,
  },
  optionChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  optionChipTextActive: { color: colors.accent },
  addRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  addLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  addChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  addChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
})
