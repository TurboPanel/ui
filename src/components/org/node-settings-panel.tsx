import { useEffect, useMemo, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  Button,
  InlineNotice,
  SegmentedControl,
  Select,
  SettingRow,
  StatusDot,
  TextField,
  Toggle,
} from '@/components/ui'
import { panelStyles } from '@/components/ui/panel-styles'
import { Section } from '@/components/ui/v4/section'
import {
  usePersistEnvironmentCompose,
  usePersistProjectCompose,
} from '@/components/org/compose-persistence'
import {
  FLOATING_NODE_VERSION,
  NEWEST_NODE_SERIES,
  SUPPORTED_NODE_SERIES,
  isNodeComposeService,
  readServiceTurbopanelExtension,
  type ComposeServiceSourceExtension,
  type ComposeServiceTurbopanelExtension,
  type NodeAppMode,
  type NodePackageManager,
} from '@/lib/compose/service-kind'
import {
  inspectRepository,
  type HostingRecord,
  type RepositoryInspection,
  type ServiceRecord,
} from '@/lib/instance-api'
import {
  composeForNodeSave,
  effectiveService,
  nodeClearRefusal,
  nodeValuesThatCannotBeCleared,
} from '@/lib/compose/node-save-target'
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

function isPlainMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Last path segment — inspect entries may carry the listPath prefix. */
function basename(path: string): string {
  const index = path.lastIndexOf('/')
  return index === -1 ? path : path.slice(index + 1)
}

/** Package manager the repository's lockfile implies, from a directory listing. */
function detectPackageManager(inspection: RepositoryInspection | null): NodePackageManager | null {
  if (!inspection) return null
  const names = new Set(
    inspection.entries.filter((entry) => entry.kind === 'file').map((entry) => basename(entry.path))
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
  startupFileDraft: string
): boolean | null {
  const startupFile = startupFileDraft.trim() || 'server.js'
  if (!inspection || startupFile.includes('/')) return null
  return inspection.entries.some(
    (entry) => entry.kind === 'file' && basename(entry.path) === startupFile
  )
}

function extensionOf(rawService: unknown): ComposeServiceTurbopanelExtension | null {
  return isPlainMapping(rawService) ? readServiceTurbopanelExtension(rawService) : null
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
  extension: ComposeServiceTurbopanelExtension | null
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

function isDraftDirty(persisted: NodeSettingsDraft, draft: NodeSettingsDraft): boolean {
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

function nodeVersionDescription(nodeVersion: string): string {
  if (nodeVersion === FLOATING_NODE_VERSION) {
    return 'Latest follows the newest Node version this server offers, so the app moves to a new series on the first deploy after the server gets one. Pick a number to keep it where it is.'
  }
  if (nodeVersion) return 'The app stays on this series and only gets patch updates.'
  return 'Not pinned: the app follows the newest Node version this server offers. Pick a number to keep it where it is.'
}

function buildVersionOptions(nodeVersion: string): { value: string; label: string }[] {
  const offered = [
    ...SUPPORTED_NODE_SERIES.map((series) => ({
      value: series,
      label: `${series}.x`,
    })),
    // Following the server is a deliberate pick, never the default.
    {
      value: FLOATING_NODE_VERSION,
      label: `Latest (follows the server, now ${NEWEST_NODE_SERIES}.x)`,
    },
  ]
  // A pinned value outside the offered series still has to display as itself.
  if (
    nodeVersion &&
    nodeVersion !== FLOATING_NODE_VERSION &&
    !SUPPORTED_NODE_SERIES.includes(nodeVersion)
  ) {
    return [{ value: nodeVersion, label: nodeVersion }, ...offered]
  }
  return offered
}

/** First hostname bound to the service's hosting, if any. */
function firstHostname(hostings: readonly HostingRecord[] | undefined): string | null {
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
  appRoot: string
): RepositoryInspection | null {
  const [inspection, setInspection] = useState<RepositoryInspection | null>(null)
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
 * Reads the service as it really is (the Base with this environment's changes
 * over it) and writes its `x-turbopanel` extension into the environment, or into
 * the Base from a view with no environment, so everything here is the same state
 * the Services form edits. Renders nothing
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

  const projectCompose = projectQuery.data?.project.options?.compose
  const environmentCompose = environmentQuery.data?.environment.options?.compose
  const environmentReady = !environmentId || environmentQuery.data !== undefined
  // The service as it really is (the Base with this environment's changes over it).
  const rawService = useMemo(
    () => effectiveService(projectCompose, environmentCompose, composeServiceName),
    [projectCompose, environmentCompose, composeServiceName]
  )
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
    appRoot.trim()
  )

  if (!isPlainMapping(rawService) || !isNodeComposeService(rawService)) {
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
  // From an environment, Save waits until its own changes have loaded, and a value the
  // Base sets cannot be cleared there.
  const cannotClear = environmentId
    ? nodeValuesThatCannotBeCleared(draft, projectCompose, composeServiceName)
    : []
  const saveBlocked = environmentId && !environmentReady
  const blockReason = cannotClear.length ? nodeClearRefusal(cannotClear) : null

  const save = async () => {
    if (!canManage || !source) return
    setSaving(true)
    setError(null)
    setSavedHint(false)
    const planned = composeForNodeSave({
      environmentId,
      projectCompose,
      environmentCompose,
      environmentReady,
      serviceName: composeServiceName,
      effective: rawService,
      values: draft,
      source,
    })
    if (!planned.ok) {
      setSaving(false)
      setError(planned.reason)
      return
    }
    const result = await (
      planned.target === 'environment' ? persistEnvironment : persistProject
    ).run(planned.compose)
    setSaving(false)
    if (result.ok) {
      setSavedHint(true)
    } else if (result.error) {
      setError(result.error)
    }
  }

  return (
    <Section
      title={hostname ? `Node.js on ${hostname}` : 'Node.js'}
      note="Runtime settings for this app — applied on the next deploy"
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
            saveDisabled={Boolean(saveBlocked) || blockReason !== null}
            blockReason={blockReason}
            onSave={() => {
              void save()
            }}
          />
        )}
      </View>
    </Section>
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
  saveDisabled,
  blockReason,
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
  saveDisabled: boolean
  blockReason: string | null
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

      <SettingRow label="Node.js version" description={nodeVersionDescription(nodeVersion)}>
        <Select
          value={nodeVersion || null}
          options={buildVersionOptions(nodeVersion)}
          placeholder="Select a version"
          noneLabel={
            nodeVersion ? undefined : `Not pinned (follows the server, now ${NEWEST_NODE_SERIES}.x)`
          }
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

      {blockReason ? (
        <InlineNotice title="This setting comes from the Base" body={blockReason} />
      ) : null}

      {canManage && dirty ? (
        <View style={styles.saveRow}>
          <Button
            label="Save Node.js settings"
            busyLabel="Saving…"
            variant="primary"
            busy={saving}
            disabled={saveDisabled}
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
