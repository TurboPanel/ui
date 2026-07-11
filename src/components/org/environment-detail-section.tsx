import { useEffect, useMemo, useState } from 'react'
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
        if (!cancelled) {
          setEnvironment(result.environment)
          setProjectCompose(projectResult.project.options?.compose)
          setServers(serversResult.servers.filter((server) => server.connected))
          setServices(servicesResult.services)
          setServerId((current) => current || serversResult.servers.find((server) => server.connected)?.id || '')
          const entries = await Promise.all(
            servicesResult.services.map(async (service) => {
              const hostings = await fetchVisibleHostings(service.id)
              return [service.id, hostings.hostings] as const
            }),
          )
          if (!cancelled) {
            setHostingsByService(Object.fromEntries(entries))
            setHostnames(Object.fromEntries(entries.map(([serviceId, hostings]) => [
              serviceId,
              Array.isArray(hostings[0]?.options?.hostnames)
                ? hostings[0].options.hostnames.filter((hostname): hostname is string => typeof hostname === 'string').join(', ')
                : '',
            ])))
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (isForbiddenError(err)) {
            await handleUnauthorized()
            return
          }
          setError(
            err instanceof Error ? err.message : 'Failed to load environment',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [environmentId, handleUnauthorized, projectId])

  const mergedCompose = useMemo(
    () => mergeComposeOverlay(projectCompose, environment?.options?.compose),
    [environment?.options?.compose, projectCompose],
  )

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
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save compose overlay')
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
      let command = await fetchCommand(serverId, result.commandId)
      while (!TERMINAL_COMMAND_STATUSES.has(command.status)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000))
        command = await fetchCommand(serverId, result.commandId)
      }
      setDeployStatus(
        command.status === 'succeeded'
          ? 'Deployment completed.'
          : command.error ?? `Deployment ${command.status}.`,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setDeployStatus(err instanceof Error ? err.message : 'Failed to deploy environment')
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
        hostnames: (hostnames[service?.id ?? composeServiceName] ?? '')
          .split(',')
          .map((hostname) => hostname.trim())
          .filter(Boolean),
      }
      const existing = hostingsByService[resolvedService.id]?.[0]
      if (existing) {
        await updateHosting(existing.id, {
          metadata: { composeServiceName },
          options,
        })
      } else {
        await createHosting(resolvedService.id, {
          displayName: composeServiceName,
          metadata: { composeServiceName },
          options,
        })
      }
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
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setError(err instanceof Error ? err.message : 'Failed to save hosting')
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
      ) : null}

      {environment ? (
        <>
          <SectionPanel title="Compose overlay" hint="Overrides the project compose">
            <ComposeEditorSection
              document={environment.options?.compose}
              onSave={saveCompose}
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
              onPress={() => void deploy()}
            >
              <Text style={styles.deployButtonText}>{deploying ? 'Deploying…' : 'Deploy'}</Text>
            </Pressable>
            {deployStatus ? <Text style={orgPanelStyles.detailLine}>{deployStatus}</Text> : null}
          </SectionPanel>

          <SectionPanel title="Hostnames" hint="Map compose services to hostnames">
            {composeServiceNames(mergedCompose).length === 0 ? (
              <Text style={orgPanelStyles.muted}>Add services to Compose before configuring hostnames.</Text>
            ) : (
              <View style={styles.hostingList}>
                {composeServiceNames(mergedCompose).map((composeServiceName) => {
                  const service = services.find(
                    (item) => item.metadata?.composeServiceName === composeServiceName,
                  )
                  const serviceId = service?.id ?? composeServiceName
                  return (
                    <View key={composeServiceName} style={orgPanelStyles.detailCard}>
                      <Text style={orgPanelStyles.detailTitle}>{composeServiceName}</Text>
                      <TextInput
                        value={hostnames[serviceId] ?? ''}
                        onChangeText={(value) =>
                          setHostnames((current) => ({ ...current, [serviceId]: value }))
                        }
                        placeholder="app.example.com, www.example.com"
                        placeholderTextColor={colors.textDim}
                        style={styles.hostnamesInput}
                      />
                      <Pressable
                        style={[
                          styles.saveHostingButton,
                          savingHosting === composeServiceName && styles.buttonDisabled,
                        ]}
                        disabled={savingHosting !== null}
                        onPress={() => void saveHostnames(composeServiceName)}
                      >
                        <Text style={styles.saveHostingButtonText}>
                          {savingHosting === composeServiceName ? 'Saving…' : 'Save hostnames'}
                        </Text>
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            )}
          </SectionPanel>
        </>
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
