import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  InlineNotice,
  SectionPanel,
  SegmentedControl,
  Select,
  SettingRow,
  StatusDot,
  TextField,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import {
  DEFAULT_NODE_SERIES,
  SUPPORTED_NODE_SERIES,
  isNodeComposeService,
  patchServiceTurbopanelExtension,
  readServiceTurbopanelExtension,
  type ComposeServiceSourceExtension,
  type ComposeServiceTurbopanelExtension,
  type ComposeServiceTurbopanelExtensionPatch,
  type NodeAppMode,
  type NodePackageManager,
} from '@/lib/compose/service-kind'
import {
  inspectRepository,
  type ComposeDocument,
  type HostingRecord,
  type RepositoryInspection,
  type ServiceRecord,
} from '@/lib/instance-api'
import { useEnvironment } from '@/lib/queries/environments'
import { useProject } from '@/lib/queries/projects'
import { useHostings } from '@/lib/queries/services'
import { colors, spacing, webPointer } from '@/lib/theme'

const PACKAGE_MANAGERS: readonly NodePackageManager[] = ['npm', 'yarn', 'pnpm']

const LOCKFILE_BY_MANAGER: readonly [string, NodePackageManager][] = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
]

function servicesOf(
  compose: ComposeDocument | undefined,
): Record<string, unknown> | null {
  const services = compose?.data?.services
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    return null
  }
  return services as Record<string, unknown>
}

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Last path segment — inspect entries may carry the listPath prefix. */
function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/** Package manager the repository's lockfile implies, from a directory listing. */
function detectPackageManager(
  inspection: RepositoryInspection | null,
): NodePackageManager | null {
  if (!inspection) return null
  const names = new Set(
    inspection.entries
      .filter((entry) => entry.kind === 'file')
      .map((entry) => basename(entry.path)),
  )
  for (const [lockfile, manager] of LOCKFILE_BY_MANAGER) {
    if (names.has(lockfile)) return manager
  }
  return null
}

/**
 * Whether the startup file (draft value, `server.js` when empty) exists in the
 * application root, from the same listing. `null` = unknown (no listing, or
 * the name reaches into a subdirectory the listing cannot see) — the
 * indicator hides rather than lies.
 */
function startupFileExists(
  inspection: RepositoryInspection | null,
  startupFileDraft: string,
): boolean | null {
  const startupFile = startupFileDraft.trim() || 'server.js'
  if (!inspection || startupFile.includes('/')) return null
  return inspection.entries.some(
    (entry) => entry.kind === 'file' && basename(entry.path) === startupFile,
  )
}

/** `source` with the subdirectory replaced; empty clears the key. */
function sourceWithSubdirectory(
  source: ComposeServiceSourceExtension,
  subdirectory: string,
): ComposeServiceSourceExtension {
  const { subdirectory: _replaced, ...rest } = source
  return subdirectory.length === 0 ? rest : { ...rest, subdirectory }
}

type ComposeLayer = Readonly<{
  kind: 'environment' | 'project'
  compose: ComposeDocument
}>

/** Compose layer that defines this service — environment overlay first. */
function resolveComposeLayer(
  environmentCompose: ComposeDocument | undefined,
  projectCompose: ComposeDocument | undefined,
  composeServiceName: string,
): ComposeLayer | null {
  if (servicesOf(environmentCompose)?.[composeServiceName]) {
    return { kind: 'environment', compose: environmentCompose! }
  }
  if (servicesOf(projectCompose)?.[composeServiceName]) {
    return { kind: 'project', compose: projectCompose! }
  }
  return null
}

function extensionOf(
  rawService: unknown,
): ComposeServiceTurbopanelExtension | null {
  return isPlainMapping(rawService)
    ? readServiceTurbopanelExtension(rawService)
    : null
}

/** The editable settings, as drafted in the form and as persisted. */
type NodeSettingsDraft = Readonly<{
  enabled: boolean
  nodeVersion: string
  packageManager: string
  appMode: NodeAppMode
  documentRoot: string
  appRoot: string
  startupFile: string
}>

function draftFromExtension(
  extension: ComposeServiceTurbopanelExtension | null,
): NodeSettingsDraft {
  return {
    enabled: extension?.enabled ?? true,
    nodeVersion: extension?.nodeVersion ?? '',
    packageManager: extension?.packageManager ?? '',
    appMode: extension?.appMode ?? 'production',
    documentRoot: extension?.documentRoot ?? '',
    appRoot: extension?.source?.subdirectory ?? '',
    startupFile: extension?.startupFile ?? '',
  }
}

function isDraftDirty(
  persisted: NodeSettingsDraft,
  draft: NodeSettingsDraft,
): boolean {
  return (
    persisted.enabled !== draft.enabled ||
    persisted.nodeVersion !== draft.nodeVersion ||
    persisted.packageManager !== draft.packageManager ||
    persisted.appMode !== draft.appMode ||
    persisted.documentRoot !== draft.documentRoot ||
    persisted.appRoot !== draft.appRoot ||
    persisted.startupFile !== draft.startupFile
  )
}

/** Extension patch for a draft. Explicit `undefined` clears a key back to its default. */
function extensionPatchFromDraft(
  draft: NodeSettingsDraft,
  source: ComposeServiceSourceExtension,
): ComposeServiceTurbopanelExtensionPatch {
  return {
    enabled: draft.enabled ? undefined : false,
    nodeVersion: draft.nodeVersion || undefined,
    packageManager: (draft.packageManager || undefined) as
      | NodePackageManager
      | undefined,
    appMode: draft.appMode === 'production' ? undefined : draft.appMode,
    documentRoot: draft.documentRoot || undefined,
    startupFile: draft.startupFile || undefined,
    source: sourceWithSubdirectory(source, draft.appRoot),
  }
}

function buildVersionOptions(
  nodeVersion: string,
): { value: string; label: string }[] {
  const offered = SUPPORTED_NODE_SERIES.map((series) => ({
    value: series,
    label: `${series}.x`,
  }))
  // A pinned value outside the offered series still has to display as itself.
  if (nodeVersion && !SUPPORTED_NODE_SERIES.includes(nodeVersion)) {
    return [{ value: nodeVersion, label: nodeVersion }, ...offered]
  }
  return offered
}

/** First hostname bound to the service's hosting, if any. */
function firstHostname(
  hostings: readonly HostingRecord[] | undefined,
): string | null {
  const raw = hostings?.[0]?.options?.hostnames
  if (!Array.isArray(raw)) return null
  const first = raw.find((entry): entry is string => typeof entry === 'string')
  return first ?? null
}

/**
 * One debounced repository listing powers both the detected-package-manager
 * hint and the startup-file indicator. Best-effort: a provider that cannot
 * list degrades to no hint, never to an error banner.
 */
function useRepositoryInspection(
  sourceId: string | undefined,
  branch: string | undefined,
  appRoot: string,
): RepositoryInspection | null {
  const [inspection, setInspection] = useState<RepositoryInspection | null>(
    null,
  )
  useEffect(() => {
    if (!sourceId) {
      setInspection(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      inspectRepository(sourceId, branch, appRoot || undefined)
        .then((result) => {
          if (!cancelled) setInspection(result)
        })
        .catch(() => {
          if (!cancelled) setInspection(null)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [sourceId, branch, appRoot])
  return inspection
}

/**
 * Plesk-style "Node.js" settings for one `serviceKind: node` compose service.
 *
 * Reads and writes the service's `x-turbopanel` extension on whichever compose
 * layer defines it (environment overlay first, else the project document), so
 * everything here is the same state the Services form edits. Renders nothing
 * for a service of any other kind — the mounting screen does not need to know.
 */
export function NodeSettingsPanel({
  orgId,
  projectId,
  environmentId,
  service,
  canManage,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string | null
  service: ServiceRecord
  canManage: boolean
}>) {
  const composeServiceName = service.composeServiceName
  const environmentKey = environmentId ?? ''
  const projectQuery = useProject(orgId, projectId)
  const environmentQuery = useEnvironment(orgId, environmentKey, {
    enabled: Boolean(environmentId),
  })
  const hostingsQuery = useHostings(orgId, service.id)

  const layer = useMemo(
    () =>
      resolveComposeLayer(
        environmentQuery.data?.environment.options?.compose,
        projectQuery.data?.project.options?.compose,
        composeServiceName,
      ),
    [environmentQuery.data, projectQuery.data, composeServiceName],
  )

  const rawService = layer
    ? servicesOf(layer.compose)?.[composeServiceName]
    : undefined
  const extension = extensionOf(rawService)

  const persistProject = usePersistProjectCompose(orgId, projectId)
  const persistEnvironment = usePersistEnvironmentCompose(orgId, environmentKey)

  const [tab, setTab] = useState<'settings' | 'commands'>('settings')
  const [enabled, setEnabled] = useState(true)
  const [nodeVersion, setNodeVersion] = useState('')
  const [packageManager, setPackageManager] = useState('')
  const [appMode, setAppMode] = useState<NodeAppMode>('production')
  const [documentRoot, setDocumentRoot] = useState('')
  const [appRoot, setAppRoot] = useState('')
  const [startupFile, setStartupFile] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedHint, setSavedHint] = useState(false)

  // Re-seed the drafts whenever the persisted extension changes underneath
  // (another tab saved, a deploy invalidated the query, …).
  const seed = JSON.stringify(draftFromExtension(extension))
  useEffect(() => {
    const values = JSON.parse(seed) as NodeSettingsDraft
    setEnabled(values.enabled)
    setNodeVersion(values.nodeVersion)
    setPackageManager(values.packageManager)
    setAppMode(values.appMode)
    setDocumentRoot(values.documentRoot)
    setAppRoot(values.appRoot)
    setStartupFile(values.startupFile)
  }, [seed, service.id])

  const inspection = useRepositoryInspection(
    extension?.source?.sourceId,
    extension?.source?.branch,
    appRoot.trim(),
  )

  if (
    !layer ||
    !isPlainMapping(rawService) ||
    !isNodeComposeService(rawService)
  ) {
    return null
  }
  const source = extension?.source

  const hostname = firstHostname(hostingsQuery.data?.hostings)
  const applicationUrl = hostname ? `https://${hostname}` : null

  const draft: NodeSettingsDraft = {
    enabled,
    nodeVersion,
    packageManager,
    appMode,
    documentRoot: documentRoot.trim(),
    appRoot: appRoot.trim(),
    startupFile: startupFile.trim(),
  }
  const dirty = isDraftDirty(JSON.parse(seed) as NodeSettingsDraft, draft)

  const persist =
    layer.kind === 'environment' ? persistEnvironment : persistProject

  const save = async () => {
    if (!canManage || !source) return
    setSaving(true)
    setError(null)
    setSavedHint(false)
    const services = { ...servicesOf(layer.compose) }
    services[composeServiceName] = patchServiceTurbopanelExtension(
      rawService,
      extensionPatchFromDraft(draft, source),
    )
    const compose: ComposeDocument = {
      ...layer.compose,
      data: { ...layer.compose.data, services },
    }
    const result = await persist.run(compose)
    setSaving(false)
    if (result.ok) {
      setSavedHint(true)
    } else if (result.error) {
      setError(result.error)
    }
  }

  return (
    <SectionPanel
      title={hostname ? `Node.js on ${hostname}` : 'Node.js'}
      hint="Runtime settings for this app — applied on the next deploy"
      accent
    >
      <View style={styles.body}>
        <SegmentedControl
          options={[
            { value: 'settings', label: 'Settings' },
            { value: 'commands', label: 'Run Node.js commands' },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel="Node.js sections"
        />

        {tab === 'commands' ? (
          <InlineNotice
            title="Coming soon"
            body="One-off npm, yarn, and pnpm script runs in the app's release directory will land here."
          />
        ) : (
          <NodeSettingsFields
            error={error}
            savedHint={savedHint}
            dirty={dirty}
            enabled={enabled}
            setEnabled={setEnabled}
            nodeVersion={nodeVersion}
            setNodeVersion={setNodeVersion}
            packageManager={packageManager}
            setPackageManager={setPackageManager}
            appMode={appMode}
            setAppMode={setAppMode}
            documentRoot={documentRoot}
            setDocumentRoot={setDocumentRoot}
            appRoot={appRoot}
            setAppRoot={setAppRoot}
            startupFile={startupFile}
            setStartupFile={setStartupFile}
            applicationUrl={applicationUrl}
            inspection={inspection}
            source={source}
            canManage={canManage}
            saving={saving}
            onSave={() => {
              void save()
            }}
          />
        )}
      </View>
    </SectionPanel>
  )
}

/** The Settings tab: every editable field plus the save row. */
function NodeSettingsFields({
  error,
  savedHint,
  dirty,
  enabled,
  setEnabled,
  nodeVersion,
  setNodeVersion,
  packageManager,
  setPackageManager,
  appMode,
  setAppMode,
  documentRoot,
  setDocumentRoot,
  appRoot,
  setAppRoot,
  startupFile,
  setStartupFile,
  applicationUrl,
  inspection,
  source,
  canManage,
  saving,
  onSave,
}: Readonly<{
  error: string | null
  savedHint: boolean
  dirty: boolean
  enabled: boolean
  setEnabled: (value: boolean) => void
  nodeVersion: string
  setNodeVersion: (value: string) => void
  packageManager: string
  setPackageManager: (value: string) => void
  appMode: NodeAppMode
  setAppMode: (value: NodeAppMode) => void
  documentRoot: string
  setDocumentRoot: (value: string) => void
  appRoot: string
  setAppRoot: (value: string) => void
  startupFile: string
  setStartupFile: (value: string) => void
  applicationUrl: string | null
  inspection: RepositoryInspection | null
  source: ComposeServiceSourceExtension | undefined
  canManage: boolean
  saving: boolean
  onSave: () => void
}>) {
  const detected = detectPackageManager(inspection)
  const startupExists = startupFileExists(inspection, startupFile)
  const controlsDisabled = !canManage || saving
  const fieldsDisabled = controlsDisabled || !enabled

  return (
    <>
      {error ? <Text style={panelStyles.error}>{error}</Text> : null}
      {savedHint && !dirty ? (
        <Text style={panelStyles.muted}>Saved — applies on the next deploy.</Text>
      ) : null}

      <SettingRow
        label="Enable Node.js"
        description={
          enabled
            ? 'The app process runs under a hardened systemd unit.'
            : 'Stopped and disabled on deploy — the site answers 502 until re-enabled. Releases keep building.'
        }
      >
        <Toggle
          value={enabled}
          onValueChange={setEnabled}
          disabled={controlsDisabled}
          accessibilityLabel="Enable Node.js"
        />
      </SettingRow>

      <SettingRow
        label="Node.js version"
        description="Series the app runs and builds on."
      >
        <Select
          value={nodeVersion || null}
          options={buildVersionOptions(nodeVersion)}
          placeholder="Select a version"
          noneLabel={`Host default (${DEFAULT_NODE_SERIES}.x)`}
          mono
          disabled={fieldsDisabled}
          accessibilityLabel="Node.js version"
          onChange={(value) => setNodeVersion(value ?? '')}
        />
      </SettingRow>

      <SettingRow
        label="Package manager"
        description={
          detected
            ? `${detected} detected from the lockfile — you can change it.`
            : 'Detected from the lockfile at build time — you can pin one.'
        }
      >
        <Select
          value={packageManager || null}
          options={PACKAGE_MANAGERS.map((manager) => ({
            value: manager,
            label: manager,
          }))}
          placeholder="Select a package manager"
          noneLabel={detected ? `Detected (${detected})` : 'Detected'}
          mono
          disabled={fieldsDisabled}
          accessibilityLabel="Package manager"
          onChange={(value) => setPackageManager(value ?? '')}
        />
      </SettingRow>

      <SettingRow
        label="Application mode"
        description="Sets NODE_ENV for the build and the running process."
      >
        <SegmentedControl
          options={[
            { value: 'production', label: 'production' },
            { value: 'development', label: 'development' },
          ]}
          value={appMode}
          onChange={setAppMode}
          disabled={fieldsDisabled}
          accessibilityLabel="Application mode"
        />
      </SettingRow>

      <ApplicationUrlRow url={applicationUrl} />

      <TextField
        label="Application root"
        hint="Directory inside the repository the app builds from — for a monorepo."
        value={appRoot}
        onChangeText={setAppRoot}
        placeholder="apps/web"
        mono
        editable={!fieldsDisabled}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="Document root"
        hint="Informational for now — node apps are served by the app process; static serving from this directory is coming."
        value={documentRoot}
        onChangeText={setDocumentRoot}
        placeholder="public"
        mono
        editable={!fieldsDisabled}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TextField
        label="Application startup file"
        labelRight={<StartupFileState exists={startupExists} />}
        hint="Script the vendored Node runs; relative to the application root."
        value={startupFile}
        onChangeText={setStartupFile}
        placeholder="server.js"
        mono
        editable={!fieldsDisabled}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {source?.startCommand ? (
        <InlineNotice
          title="A custom start command overrides the startup file"
          body={`This service starts with: ${source.startCommand}`}
        />
      ) : null}

      {canManage && dirty ? (
        <View style={styles.saveRow}>
          <Button
            label="Save Node.js settings"
            busyLabel="Saving…"
            variant="primary"
            busy={saving}
            onPress={onSave}
          />
        </View>
      ) : null}
    </>
  )
}

function ApplicationUrlRow({ url }: Readonly<{ url: string | null }>) {
  return (
    <SettingRow label="Application URL">
      {url ? (
        <Pressable
          onPress={() => {
            void Linking.openURL(url)
          }}
          style={webPointer}
          accessibilityRole="link"
        >
          <Text style={styles.link}>{url}</Text>
        </Pressable>
      ) : (
        <Text style={panelStyles.muted}>No domain assigned</Text>
      )}
    </SettingRow>
  )
}

/** Startup-file existence indicator; `null` (unknown) renders nothing. */
function StartupFileState({ exists }: Readonly<{ exists: boolean | null }>) {
  if (exists === null) return null
  return (
    <View style={styles.fileState}>
      <StatusDot tone={exists ? 'online' : 'failed'} size="sm" />
      <Text style={exists ? styles.fileOk : styles.fileMissing}>
        {exists ? 'File exists' : 'The file does not exist'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.md,
  },
  link: {
    color: colors.text,
    fontSize: 14,
    fontFamily: 'monospace',
    textDecorationLine: 'underline',
  },
  fileState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  fileOk: {
    color: colors.textBody,
    fontSize: 12,
  },
  fileMissing: {
    color: colors.error,
    fontSize: 12,
  },
  saveRow: {
    flexDirection: 'row',
  },
})
