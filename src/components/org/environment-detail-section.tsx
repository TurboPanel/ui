import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { ComposeEditorSection } from '@/components/org/compose-editor-section'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { VariablesSection } from '@/components/org/variables-section'
import { useAuth } from '@/lib/auth-context'
import {
  createHosting,
  createService,
  deployEnvironment,
  fetchEnvironment,
  fetchOrgServers,
  fetchProject,
  fetchVisibleHostings,
  fetchVisibleServices,
  fetchCommand,
  isForbiddenError,
  updateEnvironment,
  updateHosting,
  type CommandRecord,
  type ComposeDocument,
  type EnvironmentRecord,
  type HostingRecord,
  type OrgServerRecord,
  type ServiceRecord,
} from '@/lib/instance-api'
import { composeDocumentToYaml, mergeComposeOverlay } from '@/lib/compose'
import { colors, spacing } from '@/lib/theme'

const TERMINAL_COMMAND_STATUSES = new Set<CommandRecord['status']>([
  'succeeded',
  'failed',
  'timed_out',
  'cancelled',
])

function composeServiceNames(document: ComposeDocument): string[] {
  const services = document.data.services
  if (typeof services !== 'object' || services === null || Array.isArray(services)) {
    return []
  }
  return Object.keys(services)
}

function isStringHostname(hostname: unknown): hostname is string {
  return typeof hostname === 'string'
}

function formatHostingHostnames(hostings: HostingRecord[]): string {
  const raw = hostings[0]?.options?.hostnames
  if (!Array.isArray(raw)) {
    return ''
  }
  return raw.filter(isStringHostname).join(', ')
}

function pickDefaultServerId(current: string, servers: OrgServerRecord[]): string {
  if (current) {
    return current
  }
  return servers.find((server) => server.connected)?.id ?? ''
}

async function fetchHostingsByService(services: ServiceRecord[]): Promise<{
  byService: Record<string, HostingRecord[]>
  hostnames: Record<string, string>
}> {
  const entries = await Promise.all(
    services.map(async (service) => {
      const hostings = await fetchVisibleHostings(service.id)
      return [service.id, hostings.hostings] as const
    }),
  )
  return {
    byService: Object.fromEntries(entries),
    hostnames: Object.fromEntries(
      entries.map(([serviceId, hostings]) => [serviceId, formatHostingHostnames(hostings)]),
    ),
  }
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function parseHostnameList(value: string): string[] {
  return value
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
}

async function waitForTerminalCommand(
  serverId: string,
  commandId: string,
): Promise<CommandRecord> {
  let command = await fetchCommand(serverId, commandId)
  while (!TERMINAL_COMMAND_STATUSES.has(command.status)) {
    await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    command = await fetchCommand(serverId, commandId)
  }
  return command
}

function deployStatusMessage(command: CommandRecord): string {
  if (command.status === 'succeeded') {
    return 'Deployment completed.'
  }
  return command.error ?? `Deployment ${command.status}.`
}

async function reportSectionError(
  err: unknown,
  handleUnauthorized: () => Promise<void>,
  setMessage: (message: string) => void,
  fallback: string,
): Promise<void> {
  if (isForbiddenError(err)) {
    await handleUnauthorized()
    return
  }
  setMessage(errorMessage(err, fallback))
}

async function upsertHosting(
  serviceId: string,
  composeServiceName: string,
  options: { hostnames: string[] },
  hostingsByService: Record<string, HostingRecord[]>,
): Promise<void> {
  const existing = hostingsByService[serviceId]?.[0]
  if (existing) {
    await updateHosting(existing.id, {
      metadata: { composeServiceName },
      options,
    })
    return
  }
  await createHosting(serviceId, {
    displayName: composeServiceName,
    metadata: { composeServiceName },
    options,
  })
}

function HostingHostnameRow({
  composeServiceName,
  value,
  saving,
  disabled,
  onChange,
  onSave,
}: Readonly<{
  composeServiceName: string
  value: string
  saving: boolean
  disabled: boolean
  onChange: (value: string) => void
  onSave: () => void
}>) {
  return (
    <View style={orgPanelStyles.detailCard}>
      <Text style={orgPanelStyles.detailTitle}>{composeServiceName}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="app.example.com, www.example.com"
        placeholderTextColor={colors.textDim}
        style={styles.hostnamesInput}
      />
      <Pressable
        style={[styles.saveHostingButton, saving && styles.buttonDisabled]}
        disabled={disabled}
        onPress={onSave}
      >
        <Text style={styles.saveHostingButtonText}>
          {saving ? 'Saving…' : 'Save hostnames'}
        </Text>
      </Pressable>
    </View>
  )
}

function EnvironmentLoadedPanels({
  environment,
  projectId,
  mergedCompose,
  serviceNames,
  servers,
  serverId,
  setServerId,
  deploying,
  deployStatus,
  onDeploy,
  onSaveCompose,
  savingCompose,
  services,
  hostnames,
  setHostnames,
  savingHosting,
  onSaveHostnames,
}: Readonly<{
  environment: EnvironmentRecord
  projectId: string
  mergedCompose: ComposeDocument
  serviceNames: string[]
  servers: OrgServerRecord[]
  serverId: string
  setServerId: (id: string) => void
  deploying: boolean
  deployStatus: string | null
  onDeploy: () => void
  onSaveCompose: (compose: ComposeDocument) => Promise<void>
  savingCompose: boolean
  services: ServiceRecord[]
  hostnames: Record<string, string>
  setHostnames: Dispatch<SetStateAction<Record<string, string>>>
  savingHosting: string | null
  onSaveHostnames: (composeServiceName: string) => void
}>) {
  return (
    <>
      <SectionPanel title="Environment" hint="Environment details">
        <Text style={orgPanelStyles.detailTitle}>
          {environment.displayName?.trim() || 'Unnamed environment'}
        </Text>
        {environment.description ? (
          <Text style={orgPanelStyles.detailLine}>
            {environment.description}
          </Text>
        ) : null}
        <Text style={orgPanelStyles.detailLine}>
          <Text style={orgPanelStyles.detailLabel}>Project: </Text>
          {projectId}
        </Text>
      </SectionPanel>

      <SectionPanel title="Compose overlay" hint="Overrides the project compose">
        <ComposeEditorSection
          document={environment.options?.compose}
          onSave={onSaveCompose}
          saving={savingCompose}
          title="Environment compose overlay"
        />
      </SectionPanel>

      <SectionPanel title="Merged runtime compose" hint="Project base with this environment overlay">
        <TextInput
          editable={false}
          multiline
          value={composeDocumentToYaml(mergedCompose)}
          style={styles.preview}
          textAlignVertical="top"
        />
      </SectionPanel>

      <SectionPanel title="Deploy" hint="Deploy this environment to a connected server">
        <View style={styles.serverList}>
          {servers.length === 0 ? (
            <Text style={orgPanelStyles.muted}>No connected servers available.</Text>
          ) : (
            servers.map((server) => (
              <Pressable
                key={server.id}
                style={[styles.serverOption, serverId === server.id && styles.serverOptionSelected]}
                onPress={() => setServerId(server.id)}
              >
                <Text style={styles.serverOptionText}>
                  {server.displayName?.trim() || server.hostname || server.id}
                </Text>
              </Pressable>
            ))
          )}
        </View>
        <Pressable
          style={[styles.deployButton, deploying && styles.buttonDisabled]}
          disabled={deploying || !serverId}
          onPress={onDeploy}
        >
          <Text style={styles.deployButtonText}>{deploying ? 'Deploying…' : 'Deploy'}</Text>
        </Pressable>
        {deployStatus ? <Text style={orgPanelStyles.detailLine}>{deployStatus}</Text> : null}
      </SectionPanel>

      <SectionPanel title="Hostnames" hint="Map compose services to hostnames">
        {serviceNames.length === 0 ? (
          <Text style={orgPanelStyles.muted}>Add services to Compose before configuring hostnames.</Text>
        ) : (
          <View style={styles.hostingList}>
            {serviceNames.map((composeServiceName) => {
              const service = services.find(
                (item) => item.metadata?.composeServiceName === composeServiceName,
              )
              const serviceId = service?.id ?? composeServiceName
              return (
                <HostingHostnameRow
                  key={composeServiceName}
                  composeServiceName={composeServiceName}
                  value={hostnames[serviceId] ?? ''}
                  saving={savingHosting === composeServiceName}
                  disabled={savingHosting !== null}
                  onChange={(value) =>
                    setHostnames((current) => ({ ...current, [serviceId]: value }))
                  }
                  onSave={() => onSaveHostnames(composeServiceName)}
                />
              )
            })}
          </View>
        )}
      </SectionPanel>
    </>
  )
}

export function EnvironmentDetailSection({
  orgId,
  projectId,
  environmentId,
}: Readonly<{
  orgId: string
  projectId: string
  environmentId: string
}>) {
  const { handleUnauthorized } = useAuth()
  const [environment, setEnvironment] = useState<EnvironmentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [projectCompose, setProjectCompose] = useState<unknown>(null)
  const [savingCompose, setSavingCompose] = useState(false)
  const [servers, setServers] = useState<OrgServerRecord[]>([])
  const [serverId, setServerId] = useState('')
  const [deploying, setDeploying] = useState(false)
  const [deployStatus, setDeployStatus] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceRecord[]>([])
  const [hostingsByService, setHostingsByService] = useState<Record<string, HostingRecord[]>>({})
  const [hostnames, setHostnames] = useState<Record<string, string>>({})
  const [savingHosting, setSavingHosting] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [result, projectResult, serversResult, servicesResult] = await Promise.all([
          fetchEnvironment(environmentId),
          fetchProject(projectId),
          fetchOrgServers(),
          fetchVisibleServices(environmentId),
        ])
        if (cancelled) {
          return
        }
        setEnvironment(result.environment)
        setProjectCompose(projectResult.project.options?.compose)
        setServers(serversResult.servers.filter((server) => server.connected))
        setServices(servicesResult.services)
        setServerId((current) => pickDefaultServerId(current, serversResult.servers))
        const hostingState = await fetchHostingsByService(servicesResult.services)
        if (cancelled) {
          return
        }
        setHostingsByService(hostingState.byService)
        setHostnames(hostingState.hostnames)
      } catch (err) {
        if (cancelled) {
          return
        }
        await reportSectionError(
          err,
          handleUnauthorized,
          setError,
          'Failed to load environment',
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load().catch(() => {
      // Errors are handled inside load via setError / unauthorized recovery.
    })

    return () => {
      cancelled = true
    }
  }, [environmentId, handleUnauthorized, projectId])

  const mergedCompose = useMemo(
    () => mergeComposeOverlay(projectCompose, environment?.options?.compose),
    [environment?.options?.compose, projectCompose],
  )
  const serviceNames = useMemo(() => composeServiceNames(mergedCompose), [mergedCompose])

  const saveCompose = async (compose: ComposeDocument) => {
    setSavingCompose(true)
    setError(null)
    try {
      await updateEnvironment(environmentId, { options: { compose } })
      setEnvironment((current) =>
        current
          ? { ...current, options: { compose } }
          : current,
      )
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setError,
        'Failed to save compose overlay',
      )
    } finally {
      setSavingCompose(false)
    }
  }

  const deploy = async () => {
    if (!serverId) {
      setDeployStatus('Select a connected server.')
      return
    }
    setDeploying(true)
    setDeployStatus('Queueing deployment…')
    try {
      const result = await deployEnvironment(environmentId, { serverId })
      const command = await waitForTerminalCommand(serverId, result.commandId)
      setDeployStatus(deployStatusMessage(command))
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setDeployStatus,
        'Failed to deploy environment',
      )
    } finally {
      setDeploying(false)
    }
  }

  const saveHostnames = async (composeServiceName: string) => {
    setSavingHosting(composeServiceName)
    setError(null)
    try {
      const service = services.find(
        (item) => item.metadata?.composeServiceName === composeServiceName,
      )
      const resolvedService = service ?? {
        id: (await createService(environmentId, {
          displayName: composeServiceName,
          metadata: { composeServiceName },
        })).id,
      }
      const options = {
        hostnames: parseHostnameList(hostnames[service?.id ?? composeServiceName] ?? ''),
      }
      await upsertHosting(resolvedService.id, composeServiceName, options, hostingsByService)
      const [servicesResult, hostingsResult] = await Promise.all([
        fetchVisibleServices(environmentId),
        fetchVisibleHostings(resolvedService.id),
      ])
      setServices(servicesResult.services)
      setHostingsByService((current) => ({
        ...current,
        [resolvedService.id]: hostingsResult.hostings,
      }))
      setHostnames((current) => ({
        ...current,
        [resolvedService.id]: options.hostnames.join(', '),
      }))
    } catch (err) {
      await reportSectionError(
        err,
        handleUnauthorized,
        setError,
        'Failed to save hosting',
      )
    } finally {
      setSavingHosting(null)
    }
  }

  if (loading && !environment) {
    return (
      <View style={styles.root}>
        <Text style={orgPanelStyles.muted}>Loading…</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>
        {environment?.displayName?.trim() || 'Environment'}
      </Text>

      {error ? <Text style={orgPanelStyles.error}>{error}</Text> : null}

      {environment ? (
        <EnvironmentLoadedPanels
          environment={environment}
          projectId={projectId}
          mergedCompose={mergedCompose}
          serviceNames={serviceNames}
          servers={servers}
          serverId={serverId}
          setServerId={setServerId}
          deploying={deploying}
          deployStatus={deployStatus}
          onDeploy={() => {
            deploy().catch(() => {
              // Errors are surfaced via deployStatus.
            })
          }}
          onSaveCompose={saveCompose}
          savingCompose={savingCompose}
          services={services}
          hostnames={hostnames}
          setHostnames={setHostnames}
          savingHosting={savingHosting}
          onSaveHostnames={(composeServiceName) => {
            saveHostnames(composeServiceName).catch(() => {
              // Errors are surfaced via setError.
            })
          }}
        />
      ) : null}

      <VariablesSection orgId={orgId} parentField={{ environmentId }} />
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
  preview: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 13,
    padding: spacing.sm,
  },
  serverList: { gap: spacing.xs },
  serverOption: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 6,
    backgroundColor: colors.bgSecondary,
    padding: spacing.sm,
  },
  serverOptionSelected: { borderColor: colors.accent, backgroundColor: colors.bgActive },
  serverOptionText: { color: colors.text, fontSize: 13, fontFamily: 'monospace' },
  deployButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    borderRadius: 8,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deployButtonText: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  hostingList: { gap: spacing.sm },
  hostnamesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveHostingButton: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  saveHostingButtonText: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  buttonDisabled: { opacity: 0.6 },
})
