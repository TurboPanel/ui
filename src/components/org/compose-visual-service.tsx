import { createElement, useEffect, useState, type CSSProperties } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { DockerfileEditor } from '@/components/org/dockerfile-editor'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { repositoryLabel } from '@/components/org/sources/connect-repository-panel'
import { Button, InlineNotice, LoadingState } from '@/components/ui'
import {
  clearComposeBuildInline,
  DEFAULT_INLINE_DOCKERFILE,
  dockerfileHasFromInstruction,
  parseComposeBuild,
  setComposeBuildInline,
  type ComposeBuildRef,
} from '@/lib/compose/build-ref'
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
  BASELINE_PHP_EXTENSIONS,
  OPTIONAL_PHP_EXTENSIONS,
  SUPPORTED_PHP_SERIES,
  type ComposeServicePhpExtension,
  DEFAULT_SITE_ENGINE,
  isHostNativeServiceKind,
  isSiteComposeService,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  SERVICE_DESCRIPTION_MAX_LENGTH,
  SOURCE_BRANCH_MAX_LENGTH,
  SOURCE_COMMAND_MAX_LENGTH,
  SITE_ENGINE_OPTIONS,
  TURBOPANEL_SERVICE_EXTENSION_KEY,
  type ComposeServiceKind,
  type ComposeServiceSourceExtension,
  type ComposeSourceBuildKind,
  type NativeRuntimeFramework,
  type SiteEngine,
} from '@/lib/compose/service-kind'
import {
  SOURCE_AUTO_DEPLOY_OPTIONS,
  type SourceAutoDeploy,
} from '@/lib/instance-api'
import { getActiveOrganizationId } from '@/lib/org-context'
import { projectSourcesHref } from '@/lib/org-navigation'
import {
  useSources,
  useUpdateSource,
} from '@/lib/queries/releases'
import { chrome, colors, spacing } from '@/lib/theme'

const webSelectStyle: CSSProperties = {
  width: '100%',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.border,
  borderRadius: 8,
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

/**
 * The request path, in one line, for every lane.
 *
 * Containers and sites are peers here on purpose: a container is not more
 * modern than an FPM pool, it is a different way to serve a request. Naming
 * both the same way is what lets an operator compare them without the UI
 * implying one is a concession.
 */
export function servingPathLine(
  kind: 'container' | 'site' | 'node',
  engine: SiteEngine | undefined,
): string {
  if (kind === 'container') return 'Docker → Traefik → Caddy → :443'
  if (kind === 'node') return 'Node → Caddy → :443'
  const resolved = engine ?? DEFAULT_SITE_ENGINE
  // A Caddy site is served by the site Caddy, still behind the edge one.
  if (resolved === 'caddy') return 'Caddy → Caddy → :443'
  if (resolved === 'apache') return 'Apache → Caddy → :443'
  if (resolved === 'openlitespeed') return 'OpenLiteSpeed → Caddy → :443'
  return 'nginx → Caddy → :443'
}

function siteEngineHint(
  engine: SiteEngine | undefined,
): string {
  if (engine === 'caddy') {
    return 'Files are served from the host document root by the per-site Caddy; PHP runs in a per-site php-fpm pool over php_fastcgi, and web.env is injected into it. The edge Caddy terminates TLS.'
  }
  if (engine === 'openlitespeed') {
    return 'Files are served from the host document root via OpenLiteSpeed; PHP runs as a per-vhost LSAPI process under suEXEC. web.env is not injected into the process — use Apache when you need SetEnv. Hosting Caddy terminates TLS.'
  }
  if (engine === 'apache') {
    return 'Files are served from the host document root via Apache; PHP runs in a per-site php-fpm pool over mod_proxy_fcgi (never mod_php), and web.env is applied as SetEnv. Hosting Caddy terminates TLS.'
  }
  return 'Files are served from the host document root via nginx; PHP runs in a per-site php-fpm pool over fastcgi_pass. web.env is written to hosting.env but not injected into the process — use Apache when you need SetEnv. Hosting Caddy terminates TLS.'
}

/** Settings the form surfaces directly; the rest stay reachable in YAML. */
const PHP_SETTING_FIELDS: readonly {
  key: string
  label: string
  placeholder: string
  numeric?: boolean
}[] = [
  { key: 'memory_limit', label: 'Memory limit', placeholder: '256M' },
  { key: 'upload_max_filesize', label: 'Max upload size', placeholder: '32M' },
  { key: 'post_max_size', label: 'Max POST size', placeholder: '32M' },
  {
    key: 'max_execution_time',
    label: 'Max execution time (seconds)',
    placeholder: '30',
    numeric: true,
  },
  {
    key: 'max_input_vars',
    label: 'Max input vars',
    placeholder: '1000',
    numeric: true,
  },
  { key: 'date.timezone', label: 'Timezone', placeholder: 'UTC' },
]

/**
 * PHP configuration for a site, edited where it lives.
 *
 * This used to be on the hosting row, which could not work: an FPM pool is
 * keyed by (environment, compose service), so several hostings on one service
 * silently last-wins merged into one pool. It belongs to the service.
 *
 * Values are validated on save by the instance's settings table, which
 * validates then *drops* — so a refused value shows up as a lint issue in the
 * editor rather than being silently escaped into a config file.
 */
function PhpFields({
  php,
  engine,
  disabled,
  onChange,
}: Readonly<{
  php: ComposeServicePhpExtension | undefined
  engine: SiteEngine
  disabled: boolean
  onChange: (php: ComposeServicePhpExtension | undefined) => void
}>) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const settings = php?.settings ?? {}
  const pool = php?.pool ?? {}
  const extensions = php?.extensions ?? []

  const emit = (next: ComposeServicePhpExtension) => {
    for (const field of ['settings', 'pool'] as const) {
      const block = next[field]
      if (block && Object.keys(block).length === 0) delete next[field]
    }
    if (next.extensions?.length === 0) delete next.extensions
    onChange(Object.keys(next).length > 0 ? next : undefined)
  }
  const setBlockValue = (
    field: 'settings' | 'pool',
    key: string,
    raw: string,
  ) => {
    const block = { ...php?.[field] }
    const trimmed = raw.trim()
    if (trimmed === '') delete block[key]
    else block[key] = trimmed
    emit({ ...php, [field]: block })
  }
  const toggleExtension = (name: string) => {
    const next = extensions.includes(name)
      ? extensions.filter((entry) => entry !== name)
      : [...extensions, name].sort((a, b) => a.localeCompare(b))
    emit({ ...php, extensions: next })
  }

  const mechanism = engine === 'openlitespeed'
    ? 'a per-vhost LSAPI process under suEXEC'
    : 'a per-site php-fpm pool'
  const enabled = php !== undefined && Object.keys(php).length > 0

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>PHP</Text>
      <OptionSelect
        value={php?.version ?? ''}
        options={[
          { value: '', label: enabled ? 'Host default' : 'Off — serve files only' },
          ...SUPPORTED_PHP_SERIES.map((series) => ({
            value: series,
            label: `PHP ${series}`,
          })),
        ]}
        disabled={disabled}
        onChange={(version) => emit({ ...php, version: version || undefined })}
      />
      <Text style={styles.hint}>
        Leave every field blank to serve this site as static files. Setting any
        of them turns PHP on, running in {mechanism}.
      </Text>

      {PHP_SETTING_FIELDS.slice(0, 4).map((field) => (
        <TextInput
          key={field.key}
          value={String(settings[field.key] ?? '')}
          onChangeText={(value) => setBlockValue('settings', field.key, value)}
          editable={!disabled}
          placeholder={`${field.label}, e.g. ${field.placeholder}`}
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={field.numeric ? 'number-pad' : 'default'}
          style={styles.input}
        />
      ))}

      <Pressable
        onPress={() => setShowAdvanced((open) => !open)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={showAdvanced ? 'Hide PHP advanced' : 'Show PHP advanced'}
      >
        <Text style={styles.hint}>
          {showAdvanced ? '− Advanced' : '+ Advanced — extensions, limits, workers'}
        </Text>
      </Pressable>

      {showAdvanced ? (
        <>
          {PHP_SETTING_FIELDS.slice(4).map((field) => (
            <TextInput
              key={field.key}
              value={String(settings[field.key] ?? '')}
              onChangeText={(value) => setBlockValue('settings', field.key, value)}
              editable={!disabled}
              placeholder={`${field.label}, e.g. ${field.placeholder}`}
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={field.numeric ? 'number-pad' : 'default'}
              style={styles.input}
            />
          ))}

          <Text style={styles.label}>Extensions</Text>
          <Text style={styles.hint}>
            {BASELINE_PHP_EXTENSIONS.join(', ')} are always installed. Anything
            you add here is loaded for every site on this PHP version on the
            same server — PHP has no per-site extension loading.
          </Text>
          <View style={styles.extensionRow}>
            {OPTIONAL_PHP_EXTENSIONS.map((name: string) => {
              const on = extensions.includes(name)
              return (
                <Pressable
                  key={name}
                  onPress={() => toggleExtension(name)}
                  disabled={disabled}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled }}
                  accessibilityLabel={name}
                  style={[styles.extensionChip, on && styles.extensionChipOn]}
                >
                  <Text style={on ? styles.extensionTextOn : styles.extensionText}>
                    {name}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={styles.label}>Workers</Text>
          <OptionSelect
            value={String(pool.pm ?? '')}
            options={[
              { value: '', label: 'On demand (default)' },
              { value: 'ondemand', label: 'On demand' },
              { value: 'dynamic', label: 'Dynamic' },
              { value: 'static', label: 'Static' },
            ]}
            disabled={disabled}
            onChange={(value) => setBlockValue('pool', 'pm', value)}
          />
          <TextInput
            value={String(pool['pm.max_children'] ?? '')}
            onChangeText={(value) => setBlockValue('pool', 'pm.max_children', value)}
            editable={!disabled}
            placeholder="Max worker processes, e.g. 20"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            style={styles.input}
          />
          <Text style={styles.hint}>
            OpenLiteSpeed maps these onto its own LSAPI limits rather than an
            FPM pool.
          </Text>
        </>
      ) : null}
    </View>
  )
}

function OptionSelect({
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  value: string
  options: readonly { value: string; label: string }[]
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
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
      >
        <Text style={styles.removeFieldText}>Remove</Text>
      </Pressable>
    </View>
  )
}

function ContainerNameField({
  value,
  disabled,
  onChange,
  onRemove,
}: Readonly<{
  value: unknown
  disabled: boolean
  onChange: (containerName: string) => void
  onRemove: () => void
}>) {
  const text = typeof value === 'string' ? value : ''
  return (
    <View style={styles.fieldBlock}>
      <FieldHeader
        label="Container name"
        onRemove={onRemove}
        disabled={disabled}
      />
      <TextInput
        value={text}
        onChangeText={onChange}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Explicit Docker container_name"
        placeholderTextColor={colors.textDim}
        style={styles.input}
      />
      <Text style={styles.hint}>
        Sets Compose container_name. Leave blank / remove so project naming
        (uuid or Docker defaults) applies at deploy.
      </Text>
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

function externalBuildLocationSuffix(buildRef: ComposeBuildRef): string {
  const parts: string[] = []
  if (buildRef.context) {
    parts.push(`context: ${buildRef.context}`)
  }
  if (buildRef.dockerfilePath) {
    parts.push(`dockerfile: ${buildRef.dockerfilePath}`)
  }
  if (parts.length === 0) {
    return ''
  }
  return ` (${parts.join(', ')})`
}

function DockerfileField({
  value,
  disabled,
  onPatch,
  onClear,
}: Readonly<{
  value: unknown
  disabled: boolean
  onPatch: (build: Record<string, unknown>) => void
  onClear: () => void
}>) {
  const buildRef = parseComposeBuild(value)

  const handleRemove = () => {
    // Path-based / external builds have no inline body to strip — drop the key.
    if (buildRef.kind !== 'inline') {
      onClear()
      return
    }
    const next = clearComposeBuildInline(value)
    if (next === undefined) {
      onClear()
      return
    }
    onPatch(next)
  }

  return (
    <View style={styles.fieldBlock}>
      <FieldHeader
        label="Dockerfile"
        onRemove={handleRemove}
        disabled={disabled}
      />

      {buildRef.kind === 'inline' ? (
        <>
          <DockerfileEditor
            value={buildRef.dockerfileInline}
            editable={!disabled}
            onChangeText={(text) => {
              onPatch(setComposeBuildInline(value, text))
            }}
          />
          <Text style={styles.hint}>
            Build context is the deployment directory (context: .).
          </Text>
          {!dockerfileHasFromInstruction(buildRef.dockerfileInline) ? (
            <Text style={styles.hintWarn}>
              Dockerfile has no FROM instruction — the build will fail.
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Edits are picked up on Cacheless redeploy or when Disable build
            cache is enabled for this service in Service settings.
          </Text>
        </>
      ) : null}

      {buildRef.kind === 'external' ? (
        <>
          <Text style={styles.hint}>
            This service uses an external build
            {externalBuildLocationSuffix(buildRef)}. Edit the Compose YAML to
            change path-based builds, or convert to an inline Dockerfile below.
          </Text>
          <Pressable
            style={styles.convertChip}
            disabled={disabled}
            onPress={() => {
              onPatch(setComposeBuildInline(value, DEFAULT_INLINE_DOCKERFILE))
            }}
          >
            <Text style={styles.convertChipText}>
              Convert to inline Dockerfile
            </Text>
          </Pressable>
        </>
      ) : null}

      {buildRef.kind === 'none' ? (
        <Text style={styles.hint}>No build configuration.</Text>
      ) : null}
    </View>
  )
}

type ContainerVisualFlags = {
  addable: VisualFieldDef[]
  showRestart: boolean
  showPorts: boolean
  showBuild: boolean
  showContainerName: boolean
  showImageFields: boolean
  showRegistryAdd: boolean
  hasAddChips: boolean
}

/**
 * Build lanes that exist as concepts but have no wiring behind them yet.
 *
 * Rendered disabled rather than omitted so the surface tells the truth about
 * what is coming without pretending it works today.
 */
const RESERVED_DEPLOYMENT_MODES: readonly { label: string; hint: string }[] = [
  { label: 'Dockerfile', hint: 'Build the repository\'s Dockerfile — not wired up yet.' },
]

/**
 * How a connected repository is turned into something runnable.
 *
 * This is a property of the **source binding**, not of the service kind, which
 * is why it lives beside the build / start command rather than in the
 * Deployment mode chips above: the same container service can be built either
 * way without changing what it *is*. `railpack` is offered only for a container
 * service — `site` and `node` already have their own build and
 * runtime lanes, and the instance rejects the combination on save rather than
 * quietly ignoring it.
 */
const SOURCE_BUILD_KIND_OPTIONS: readonly {
  value: ComposeSourceBuildKind
  label: string
  hint: string
  containerOnly: boolean
}[] = [
  {
    value: 'native',
    label: 'Automatic',
    hint:
      'Builds the repository and publishes the result as a release on the host.',
    containerOnly: false,
  },
  {
    value: 'railpack',
    label: 'Railpack — build an isolated OCI image automatically',
    hint:
      'Detects the language and builds a container image from the repository — no Dockerfile needed. The service then runs from that image like any other container.',
    containerOnly: true,
  },
]

/**
 * The native (`serviceKind: node`) lane, as chosen rather than as detected.
 *
 * `auto` is the default and stays the recommended answer — the daemon decides
 * between a Next standalone tree, a static export, and a plain server from the
 * build output. The explicit values exist for the case detection cannot cover:
 * a repository whose build emits something the heuristic reads wrong, where the
 * operator has to be able to say which lane it is.
 */
const NATIVE_FRAMEWORK_MODES: readonly {
  value: NativeRuntimeFramework
  label: string
  hint: string
}[] = [
  {
    value: 'auto',
    label: 'Native Node — automatic',
    hint:
      'Builds from the connected repository and detects the runtime from the build output.',
  },
  {
    value: 'next',
    label: 'Native Node — Next.js',
    hint:
      'Serves a Next.js build: a standalone tree is supervised, a static export is served as files.',
  },
  {
    value: 'node',
    label: 'Native Node — plain server',
    hint:
      'Supervises the start command as a host process. Set a start command on the repository below.',
  },
]

/**
 * Deployment mode — the editor for the native lane.
 *
 * Picking any of the native modes writes `x-turbopanel.serviceKind: 'node'`
 * together with its `framework`, which is what moves a Git-backed service onto
 * the host-supervised release lane instead of leaving it a container. `Container`
 * writes the kind back and the patch layer drops the native-only fields with it,
 * so the two can never disagree. The reserved image lanes stay visible and
 * disabled: they are real plans, and hiding them would make the surface look
 * like it had already decided against them.
 *
 * Node version is here rather than in a section of its own because it is
 * meaningless outside this lane — it pins the series the host runs the service
 * under, and the patch layer drops it the moment the mode is not native.
 */
/**
 * Framework and version for a `node` app.
 *
 * This used to be a "Deployment mode" chip row that also chose *container vs
 * native* — a third control for a decision the serving picker already makes,
 * and one whose own chips could not describe a site. It now covers only what is
 * genuinely a sub-choice of the Node lane.
 */
function NodeRuntimeBlock({
  framework,
  nodeVersion,
  disabled,
  onSelectNative,
  onNodeVersionChange,
}: Readonly<{
  framework: NativeRuntimeFramework | undefined
  nodeVersion: string | undefined
  disabled: boolean
  onSelectNative: (framework: NativeRuntimeFramework) => void
  onNodeVersionChange: (nodeVersion: string) => void
}>) {
  const activeFramework = framework ?? 'auto'
  const activeHint = NATIVE_FRAMEWORK_MODES.find(
    (mode) => mode.value === activeFramework,
  )?.hint

  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>Framework</Text>
      <View style={styles.modeRow}>
        {NATIVE_FRAMEWORK_MODES.map((mode) => {
          const selected = activeFramework === mode.value
          return (
            <Pressable
              key={mode.value}
              style={[styles.optionChip, selected && styles.optionChipActive]}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              onPress={() => onSelectNative(mode.value)}
            >
              <Text
                style={[
                  styles.optionChipText,
                  selected && styles.optionChipTextActive,
                ]}
              >
                {mode.label}
              </Text>
            </Pressable>
          )
        })}
        {RESERVED_DEPLOYMENT_MODES.map((mode) => (
          <View
            key={mode.label}
            style={[styles.optionChip, styles.optionChipDisabled]}
          >
            <Text style={styles.optionChipTextDisabled}>{mode.label}</Text>
          </View>
        ))}
      </View>
      {activeHint ? <Text style={styles.hint}>{activeHint}</Text> : null}
      <View style={styles.nativeFieldBlock}>
        <Text style={styles.label}>Node version</Text>
        <TextInput
          value={nodeVersion ?? ''}
          onChangeText={onNodeVersionChange}
          editable={!disabled}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="24"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
        <Text style={styles.hint}>
          Optional. A pinned series the host runs this service under (24, 24.17,
          or 24.17.0). Leave empty to use the server default.
        </Text>
      </View>
    </View>
  )
}

/**
 * Unbound source control. Loading and fetch failure are not an empty
 * repository list — the empty notice is only for a successful zero-length
 * response, and Open Sources is only on that path.
 */
function UnboundSourcePicker({
  sourcesQuery,
  disabled,
  onSelect,
  onOpenSources,
}: Readonly<{
  sourcesQuery: ReturnType<typeof useSources>
  disabled: boolean
  onSelect: (sourceId: string) => void
  onOpenSources: () => void
}>) {
  // Default `data.sources` is `[]`, so length checks cannot tell "still
  // fetching" or "the list failed" from "the org has no repositories".
  if (sourcesQuery.isError) {
    return (
      <InlineNotice
        title="Couldn't load repositories"
        body={
          sourcesQuery.error instanceof Error
            ? sourcesQuery.error.message
            : 'Failed to load connected repositories'
        }
        tone="warning"
      />
    )
  }

  if (!sourcesQuery.isSuccess) {
    return <LoadingState label="Loading repositories…" />
  }

  const sources = sourcesQuery.data.sources
  if (sources.length > 0) {
    return (
      <OptionSelect
        value=""
        options={[
          { value: '', label: 'Select a repository…' },
          ...sources.map((entry) => ({
            value: entry.id,
            label: repositoryLabel(entry),
          })),
        ]}
        disabled={disabled}
        onChange={(sourceId) => {
          if (sourceId.length === 0) return
          onSelect(sourceId)
        }}
      />
    )
  }

  return (
    <InlineNotice
      title="No repositories connected yet"
      body="Connect a repository on the organization's Sources page, then bind it to this service."
      actions={
        <Button
          label="Open Sources"
          size="sm"
          disabled={disabled}
          onPress={onOpenSources}
        />
      }
    />
  )
}

/**
 * `x-turbopanel.source` — which repository builds this service, and how.
 *
 * Shown for **every** service kind: a Git-backed release is orthogonal to
 * container / site / node. What the kind decides is how the promoted
 * release is *run*, which the Deployment mode block above states.
 *
 * The auto-deploy policy is the one field here that does not live in compose:
 * it is a column on the org-owned `source` row, because one repository
 * connected to several services has one policy and the webhook surface reads it
 * from there. Editing it therefore takes effect immediately and for every
 * service bound to that repository — which the hint says out loud.
 *
 * `serviceKind` is passed in only to decide which build modes are offerable:
 * Railpack produces an image, which is something only a container service can
 * run.
 */
function SourceSection({
  binding,
  serviceKind,
  disabled,
  onChange,
  onDisconnect,
}: Readonly<{
  binding: ComposeServiceSourceExtension | undefined
  serviceKind: ComposeServiceKind | undefined
  disabled: boolean
  onChange: (source: ComposeServiceSourceExtension) => void
  onDisconnect: () => void
}>) {
  const orgId = getActiveOrganizationId() ?? ''
  const router = useRouter()
  const sourcesQuery = useSources(orgId)
  const updateSourceMutation = useUpdateSource(orgId)

  const sources = sourcesQuery.data?.sources ?? []
  const row = binding ? sources.find((entry) => entry.id === binding.sourceId) : undefined
  // Omitted means `native` — the same default the compose parser applies, so
  // an untouched binding reads the same here as it does on the instance.
  const buildKind: ComposeSourceBuildKind = binding?.buildKind ?? 'native'
  const containerKind = serviceKind === undefined || serviceKind === 'container'
  const buildKindOptions = SOURCE_BUILD_KIND_OPTIONS.filter(
    (option) => containerKind || !option.containerOnly,
  )
  const railpack = buildKind === 'railpack'

  const commit = (patch: Partial<ComposeServiceSourceExtension>) => {
    if (!binding) return
    const next: ComposeServiceSourceExtension = { ...binding, ...patch }
    for (const key of [
      'branch',
      'subdirectory',
      'buildCommand',
      'startCommand',
      'outputDirectory',
    ] as const) {
      const value = next[key]
      if (typeof value === 'string' && value.trim().length === 0) delete next[key]
    }
    // `native` is the default, so writing it out would add a key that says
    // nothing. Dropping it keeps a plain binding free of TurboPanel noise.
    if (next.buildKind === 'native') delete next.buildKind
    onChange(next)
  }

  const setAutoDeploy = (value: string) => {
    if (!row) return
    void updateSourceMutation.run({
      sourceId: row.id,
      patch: { autoDeploy: value as SourceAutoDeploy },
    })
  }

  const unboundPicker = (
    <UnboundSourcePicker
      sourcesQuery={sourcesQuery}
      disabled={disabled}
      onSelect={(sourceId) => onChange({ sourceId })}
      onOpenSources={() => router.push(projectSourcesHref(orgId) as Href)}
    />
  )

  return (
    <View style={styles.fieldBlock}>
      <View style={styles.fieldHeader}>
        <Text style={styles.label}>Source</Text>
        {binding ? (
          <Pressable
            onPress={onDisconnect}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Disconnect repository"
          >
            <Text style={styles.removeFieldText}>Disconnect</Text>
          </Pressable>
        ) : null}
      </View>

      {binding ? (
        <>
          <OptionSelect
            value={binding.sourceId}
            options={
              sources.length > 0
                ? sources.map((entry) => ({
                    value: entry.id,
                    label: repositoryLabel(entry),
                  }))
                : [{ value: binding.sourceId, label: binding.sourceId }]
            }
            disabled={disabled}
            onChange={(sourceId) => commit({ sourceId })}
          />

          <Text style={styles.label}>Deployment mode</Text>
          <OptionSelect
            value={buildKind}
            options={buildKindOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            disabled={disabled}
            onChange={(value) =>
              commit({ buildKind: value as ComposeSourceBuildKind })
            }
          />
          <Text style={styles.hint}>
            {SOURCE_BUILD_KIND_OPTIONS.find(
              (option) => option.value === buildKind,
            )?.hint ?? ''}
          </Text>

          <Text style={styles.label}>Branch</Text>
          <TextInput
            value={binding.branch ?? ''}
            onChangeText={(branch) => commit({ branch })}
            editable={!disabled}
            maxLength={SOURCE_BRANCH_MAX_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={row?.defaultBranch ?? 'main'}
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.hint}>
            Leave empty to build the default branch of the connected repository
            {row?.defaultBranch ? ` (${row.defaultBranch})` : ''}.
          </Text>

          <Text style={styles.label}>Subdirectory</Text>
          <TextInput
            value={binding.subdirectory ?? ''}
            onChangeText={(subdirectory) => commit({ subdirectory })}
            editable={!disabled}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="apps/web"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.hint}>
            Relative path inside the repository to build from — for a monorepo.
          </Text>

          <Text style={styles.label}>Build command</Text>
          <TextInput
            value={binding.buildCommand ?? ''}
            onChangeText={(buildCommand) => commit({ buildCommand })}
            editable={!disabled}
            maxLength={SOURCE_COMMAND_MAX_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="npm run build"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          {railpack ? (
            <Text style={styles.hint}>
              Optional under Railpack — it detects a build command on its own,
              and only uses this one where the language it detected has a slot
              for it.
            </Text>
          ) : null}

          <Text style={styles.label}>Start command</Text>
          <TextInput
            value={binding.startCommand ?? ''}
            onChangeText={(startCommand) => commit({ startCommand })}
            editable={!disabled}
            maxLength={SOURCE_COMMAND_MAX_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="node server.js"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.hint}>
            {railpack
              ? 'Overrides the start command Railpack detected for the image. Leave empty to use its own.'
              : 'Only a native (node) service runs a start command; other kinds ignore it.'}
          </Text>

          <Text style={styles.label}>Output directory</Text>
          <TextInput
            value={binding.outputDirectory ?? ''}
            onChangeText={(outputDirectory) => commit({ outputDirectory })}
            editable={!disabled}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="dist"
            placeholderTextColor={colors.textDim}
            style={styles.input}
          />
          <Text style={styles.hint}>
            {railpack
              ? 'Not used under Railpack — the release is an image, not a directory. The value is kept but ignored, so switching modes back restores it.'
              : 'Publishes this directory as the release instead of the whole checkout. Setting it turns off framework detection.'}
          </Text>

          <Text style={styles.label}>Auto-deploy</Text>
          <OptionSelect
            value={row?.autoDeploy ?? 'disabled'}
            options={SOURCE_AUTO_DEPLOY_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            disabled={disabled || !row || updateSourceMutation.isPending}
            onChange={setAutoDeploy}
          />
          <Text style={styles.hint}>
            Saved on the repository, not in compose — it applies to every
            service connected to it, and takes effect immediately.
          </Text>
          {updateSourceMutation.actionError ? (
            <Text style={styles.hintWarn}>{updateSourceMutation.actionError}</Text>
          ) : null}
        </>
      ) : (
        unboundPicker
      )}
    </View>
  )
}

/**
 * `hostNative` covers both host-run kinds — `site` and `node`.
 *
 * Neither is a Docker service, so image, build, ports, restart policy, and
 * container name are all fields the deploy engine will never read for it.
 * Keying this on "is it site" alone would leave a native Node
 * service showing an image field that does nothing.
 */
function containerVisualFlags(
  service: Record<string, unknown>,
  hostNative: boolean,
  registryOpen: boolean,
): ContainerVisualFlags {
  if (hostNative) {
    return {
      addable: [],
      showRestart: false,
      showPorts: false,
      showBuild: false,
      showContainerName: false,
      showImageFields: false,
      showRegistryAdd: false,
      hasAddChips: false,
    }
  }
  const showBuild = serviceHasVisualField(service, visualFieldById('build'))
  // Image/Tag/Registry are for pulled images — hide when a Dockerfile builds on deploy.
  const showImageFields = !showBuild
  const showRegistryAdd = showImageFields && !registryOpen
  const addable = addableVisualFields(service)
  return {
    addable,
    showRestart: serviceHasVisualField(service, visualFieldById('restart')),
    showPorts: serviceHasVisualField(service, visualFieldById('ports')),
    showBuild,
    showContainerName: serviceHasVisualField(
      service,
      visualFieldById('container_name'),
    ),
    showImageFields,
    showRegistryAdd,
    hasAddChips: addable.length > 0 || showRegistryAdd,
  }
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

  const isSite = isSiteComposeService(service)
  const extension = readServiceTurbopanelExtension(service) ?? {}
  const hostNative = isHostNativeServiceKind(extension.serviceKind)
  const {
    addable,
    showRestart,
    showPorts,
    showBuild,
    showContainerName,
    showImageFields,
    showRegistryAdd,
    hasAddChips,
  } = containerVisualFlags(service, hostNative, registryOpen)

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

  /**
   * Move the service onto the native release lane.
   *
   * `framework` travels with `serviceKind` in one patch because the extension
   * writer drops `framework` / `nodeVersion` whenever the kind is not `node` —
   * writing them in two calls would land the kind first and see the framework
   * stripped straight back off. `nodeVersion` is carried over so switching
   * between native frameworks does not silently unpin the Node series.
   *
   * A native service is host-supervised, not a container, so `image` goes with
   * it: leaving one behind would keep an inert field in the compose that the
   * deploy engine never reads.
   */
  const applyNativeFramework = (framework: NativeRuntimeFramework) => {
    applyExtension({
      serviceKind: 'node',
      framework,
      ...(extension.nodeVersion === undefined
        ? {}
        : { nodeVersion: extension.nodeVersion }),
    })
    onClearField('image')
  }

  /**
   * One picker answers "how is this served?" — the kind and, for a site, the
   * engine.
   *
   * These were three controls (Service kind, Deployment mode chips, Web engine)
   * for one decision, and the chip row admitted it: no chip described a site.
   * Collapsing them needs no schema change — a container has no document root
   * and Traefik is not swappable, so `engine` stays a site-only field and
   * `container` stays its own kind.
   */
  const applyServing = (value: string) => {
    if (value === 'container' || value === 'node') {
      applyKind(value)
      return
    }
    applyExtension({
      serviceKind: 'site',
      engine: value as SiteEngine,
      root: extension.root ?? 'public',
    })
    onClearField('image')
  }

  const applyKind = (serviceKind: ComposeServiceKind) => {
    if (serviceKind === 'site') {
      applyExtension({
        serviceKind: 'site',
        engine: extension.engine ?? DEFAULT_SITE_ENGINE,
        root: extension.root ?? 'public',
      })
      onClearField('image')
      return
    }
    if (serviceKind === 'node') {
      applyNativeFramework(extension.framework ?? 'auto')
      return
    }
    applyExtension({ serviceKind: 'container' })
    const hasBuild = Object.hasOwn(service, 'build')
    if (
      !hasBuild &&
      (typeof service.image !== 'string' || service.image.trim() === '')
    ) {
      onPatchService({ image: 'nginx:alpine' })
    }
  }

  /**
   * Pin (or clear) the Node series.
   *
   * An empty box means "server default", so it clears the field rather than
   * persisting a blank. A partially-typed version (`24.`) is kept in the patch
   * and dropped by the extension parser, which is the same forgiving behavior
   * every other free-text field here has while it is being typed.
   */
  const applyNodeVersion = (nodeVersion: string) => {
    const trimmed = nodeVersion.trim()
    applyExtension({
      serviceKind: 'node',
      framework: extension.framework ?? 'auto',
      ...(trimmed.length === 0 ? {} : { nodeVersion: trimmed }),
    })
  }

  return (
    <View style={orgPanelStyles.detailCard}>
      <View style={styles.serviceHeader}>
        <Text style={styles.serviceHeaderTitle}>Service</Text>
        <Pressable
          onPress={onRemoveService}
          disabled={saving}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove service"
        >
          <Text style={styles.removeText}>Remove</Text>
        </Pressable>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Name</Text>
        <TextInput
          value={nameDraft}
          onChangeText={onNameDraftChange}
          onEndEditing={(event) => onRename(event.nativeEvent.text)}
          editable={!saving}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="web, api, worker…"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          value={extension.description ?? ''}
          onChangeText={(description) => {
            if (description.length > SERVICE_DESCRIPTION_MAX_LENGTH) {
              return
            }
            applyExtension({
              description: description.trim() ? description : '',
            })
          }}
          editable={!saving}
          multiline
          numberOfLines={3}
          maxLength={SERVICE_DESCRIPTION_MAX_LENGTH}
          textAlignVertical="top"
          placeholder="Optional notes for operators"
          placeholderTextColor={colors.textDim}
          style={[styles.input, styles.descriptionInput]}
        />
        <Text style={styles.hint}>
          TurboPanel-only metadata stored under x-turbopanel — not used by
          Docker Compose.
        </Text>
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.label}>How is this served?</Text>
        <OptionSelect
          value={extension.serviceKind === 'site'
            ? (extension.engine ?? DEFAULT_SITE_ENGINE)
            : (extension.serviceKind ?? 'container')}
          options={[
            { value: 'container', label: 'Container image' },
            ...SITE_ENGINE_OPTIONS.map((entry) => ({
              value: entry.value,
              label: entry.label,
            })),
            { value: 'node', label: 'Node app' },
          ]}
          disabled={saving}
          onChange={applyServing}
        />
        <Text style={styles.hint}>
          {servingPathLine(
            (extension.serviceKind ?? 'container') as
              | 'container'
              | 'site'
              | 'node',
            extension.engine,
          )}
        </Text>
      </View>

      {extension.serviceKind === 'node' ? (
        <NodeRuntimeBlock
          framework={extension.framework}
          nodeVersion={extension.nodeVersion}
          disabled={saving}
          onSelectNative={applyNativeFramework}
          onNodeVersionChange={applyNodeVersion}
        />
      ) : null}

      <SourceSection
        binding={extension.source}
        serviceKind={extension.serviceKind}
        disabled={saving}
        onChange={(source) => applyExtension({ source })}
        onDisconnect={() => applyExtension({ source: null })}
      />

      {isSite ? (
        <>
          <Text style={styles.hint}>{siteEngineHint(extension.engine)}</Text>
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Document root</Text>
            <TextInput
              value={extension.root ?? 'public'}
              onChangeText={(root) =>
                applyExtension({
                  serviceKind: 'site',
                  engine: extension.engine ?? DEFAULT_SITE_ENGINE,
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
              Relative path under the site directory on the server (default
              public).
            </Text>
          </View>
          <PhpFields
            php={extension.php}
            engine={extension.engine ?? DEFAULT_SITE_ENGINE}
            disabled={saving}
            onChange={(php) =>
              applyExtension({
                serviceKind: 'site',
                engine: extension.engine ?? DEFAULT_SITE_ENGINE,
                root: extension.root ?? 'public',
                php,
              })}
          />
        </>
      ) : null}

      {showImageFields ? (
        <ImageRefFields
          value={service.image}
          disabled={saving}
          registryOpen={registryOpen}
          onRegistryOpenChange={setRegistryOpen}
          onChange={(image) => {
            if (image.trim() === '') {
              onClearField('image')
              return
            }
            onPatchService({ image })
          }}
        />
      ) : null}

      {showBuild ? (
        <DockerfileField
          value={service.build}
          disabled={saving}
          onPatch={(build) => onPatchService({ build })}
          onClear={() => onClearField('build')}
        />
      ) : null}

      {showRestart ? (
        <RestartField
          value={service.restart}
          disabled={saving}
          onChange={(restart) => onPatchService({ restart })}
          onRemove={() => onClearField('restart')}
        />
      ) : null}

      {showContainerName ? (
        <ContainerNameField
          value={service.container_name}
          disabled={saving}
          onChange={(containerName) =>
            onPatchService({ container_name: containerName })
          }
          onRemove={() => onClearField('container_name')}
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
  serviceHeaderTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  removeText: { color: colors.errorText, fontSize: 12, fontWeight: '600' },
  removeFieldText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  hint: { color: colors.textDim, fontSize: 11, lineHeight: 16 },
  hintWarn: { color: colors.pending, fontSize: 11, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  descriptionInput: {
    minHeight: 72,
    fontFamily: 'System',
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
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  optionChipActive: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  optionChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  optionChipTextActive: { color: chrome.accent },
  optionChipDisabled: {
    borderStyle: 'dashed',
    opacity: 0.5,
  },
  optionChipTextDisabled: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  nativeFieldBlock: { gap: 4, marginTop: 4 },
  convertChip: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  convertChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
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
    borderRadius: 8,
    borderStyle: 'dashed',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  extensionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  extensionChip: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  extensionChipOn: {
    borderColor: chrome.accent,
    backgroundColor: chrome.bgActive,
  },
  extensionText: { color: colors.textMuted, fontSize: 12 },
  extensionTextOn: { color: colors.text, fontSize: 12, fontWeight: '600' },
})
