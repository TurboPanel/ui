import { useRouter, type Href } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Linking, Text, View } from 'react-native'
import {
  AppsSection,
  ChangesSection,
  DataSection,
  HostingSection,
  type HostingsStatus,
  LinuxUsersSection,
  VariablesSection,
} from '@/components/org/project/configuration/config-sections'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import { SaveBar } from '@/components/org/project/configuration/save-bar'
import { useProjectContext } from '@/components/org/project/project-context'
import { LoadingState } from '@/components/ui'
import { Toggle } from '@/components/ui/toggle'
import { ActionButton, Notice } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  projectBaseHref,
  projectEnvironmentHostingHref,
  projectEnvironmentServiceHref,
} from '@/lib/project-navigation'
import { useSaveConfiguration } from '@/lib/queries/configuration'
import { useEnvironmentConfigView } from '@/lib/queries/environments'
import { useHostingsByServices } from '@/lib/queries/services'
import { useVariables } from '@/lib/queries/variables'
import { environmentDisplayName } from '@/lib/resource-labels'
import {
  changeActions,
  stageEdit,
  unstageEdit,
  variableFacts,
  type SaveProblem,
  type StagedEdit,
} from '@/lib/v4/config-edits'
import {
  buildConfigViewModel,
  withHostingHostnames,
  type ConfigViewModel,
} from '@/lib/v4/config-view-model'

const styles = themedStyles((p) => ({
  page: { gap: 24 },
  stack: { gap: 16 },
  lede: { ...typeStyle('body', 'subhead'), color: p.text3 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
}))

/** The "Only changes from Base (N)" switch: the shared switch, its label as the word beside it. */
function OnlyChangesSwitch({
  label,
  on,
  onToggle,
}: Readonly<{ label: string; on: boolean; onToggle: () => void }>) {
  return (
    <Toggle
      value={on}
      onValueChange={onToggle}
      onLabel={label}
      offLabel={label}
      accessibilityLabel={label}
    />
  )
}

function lede(model: ConfigViewModel): string {
  if (model.standsAlone) {
    return `${model.envName} stands alone: it keeps its own apps and does not use the Base's.`
  }
  return `${model.envName} uses the Base for anything it does not set itself. A value marked “From the Base” can be changed here for this environment only.`
}

/** The tab body once the config-view answer is in. Presentational: links go through the callbacks. */
export function EnvironmentConfigurationView({
  model,
  hostingsStatus = 'ready',
  multiple,
  onOpenApp,
  onOpenUrl,
  onManageHosting,
  onOpenBase,
  editing,
}: Readonly<{
  model: ConfigViewModel
  /** The project has more than one environment (the Base can differ from this one). */
  multiple: boolean
  /** Whether the hostnames added on the Hosting screen have loaded (the compose ones are in the model). */
  hostingsStatus?: HostingsStatus
  onOpenApp: (serviceId: string) => void
  onOpenUrl: (url: string) => void
  onManageHosting: () => void
  onOpenBase: () => void
  /** Present when the person can edit; absent means every row is read-only. */
  editing?: EditingApi
}>) {
  const s = styles(usePalette())
  const [only, setOnly] = useState(false)
  const filtering = multiple && only
  return (
    <View style={s.page}>
      <Text style={s.lede}>{lede(model)}</Text>
      <View style={s.top}>
        {multiple ? (
          <OnlyChangesSwitch
            label={model.onlyChangesLabel}
            on={only}
            onToggle={() => setOnly((value) => !value)}
          />
        ) : null}
        <ActionButton label="Open the Base" variant="quiet" size="sm" onPress={onOpenBase} />
      </View>
      {filtering ? (
        <ChangesSection
          changes={model.changes}
          envName={model.envName}
          onShowEverything={() => setOnly(false)}
          editing={editing}
        />
      ) : (
        <>
          <AppsSection apps={model.apps} onOpenApp={onOpenApp} />
          <HostingSection
            domains={model.domains}
            hostingsStatus={hostingsStatus}
            onOpenUrl={onOpenUrl}
            onManage={onManageHosting}
          />
          <VariablesSection variables={model.variables} envName={model.envName} editing={editing} />
          <LinuxUsersSection users={model.linuxUsers} editing={editing} />
          <DataSection data={model.data} />
        </>
      )}
    </View>
  )
}

/** Environment Configuration tab: everything this environment runs, and where each value comes from. */
export function EnvironmentConfigurationScreen() {
  const s = styles(usePalette())
  const router = useRouter()
  const {
    orgId,
    projectId,
    environments,
    selectedEnvironment,
    pathEnvironmentId,
    canOwn,
    projectAllowsMutations,
  } = useProjectContext()
  const environmentId = pathEnvironmentId ?? selectedEnvironment?.id ?? ''
  const query = useEnvironmentConfigView(orgId, environmentId)
  const projectVariables = useVariables(orgId, { projectId })
  const environmentVariables = useVariables(orgId, { environmentId })
  const save = useSaveConfiguration(orgId, projectId, environmentId)
  const environment = environments.find((item) => item.id === environmentId)
  const envName = environment ? environmentDisplayName(environment) : 'This environment'
  const baseModel = useMemo(
    () => (query.data ? buildConfigViewModel({ envName, view: query.data }) : null),
    [query.data, envName]
  )
  // The config view reads compose only; hostnames added on the Hosting screen live in the panel.
  const serviceIds = useMemo(
    () => (baseModel?.apps ?? []).flatMap((app) => (app.serviceId === null ? [] : [app.serviceId])),
    [baseModel]
  )
  const hostings = useHostingsByServices(orgId, serviceIds, { enabled: baseModel !== null })
  const model = useMemo(
    () => (baseModel ? withHostingHostnames(baseModel, hostings.hostingsByService) : null),
    [baseModel, hostings.hostingsByService]
  )
  let hostingsStatus: HostingsStatus = 'ready'
  if (hostings.hasError) hostingsStatus = 'error'
  else if (hostings.isLoading) hostingsStatus = 'loading'
  const [staged, setStaged] = useState<readonly StagedEdit[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [problems, setProblems] = useState<readonly SaveProblem[]>([])
  const [savedCount, setSavedCount] = useState(0)

  const stage = useCallback((edit: StagedEdit) => {
    setStaged((current) => stageEdit(current, edit))
    setSavedCount(0)
  }, [])
  const unstage = useCallback(
    (key: string) => setStaged((current) => unstageEdit(current, key)),
    []
  )
  const discard = useCallback(() => {
    setStaged([])
    setSaveError(null)
    setProblems([])
  }, [])
  const saveAll = useCallback(async () => {
    setSaveError(null)
    setProblems([])
    const result = await save.run(staged)
    if (!result.ok) {
      setSaveError(save.actionError ?? 'Could not save these changes.')
      return
    }
    setStaged(result.value.remaining)
    setProblems(result.value.problems)
    setSaveError(result.value.error)
    setSavedCount(result.value.error === null ? result.value.saved : 0)
  }, [save, staged])

  const editable = canOwn && projectAllowsMutations
  const envVariableRecords = environmentVariables.data?.variables
  const projectVariableRecords = projectVariables.data?.variables
  const editing = useMemo<EditingApi | undefined>(() => {
    if (!editable || !model || !envVariableRecords || !projectVariableRecords) return undefined
    return {
      envName,
      staged,
      linuxUserNames: model.linuxUserNames,
      variableFacts: (name) => variableFacts(name, envVariableRecords, projectVariableRecords),
      actionsFor: (change) => changeActions(change, envVariableRecords, model.standsAlone),
      onStage: stage,
      onUnstage: unstage,
    }
  }, [editable, model, envVariableRecords, projectVariableRecords, envName, staged, stage, unstage])

  if (query.isPending) return <LoadingState label="Loading configuration…" />
  if (query.error || !model) {
    return (
      <Notice
        tone="bad"
        title="Could not load this configuration"
        body={query.error instanceof Error ? query.error.message : 'Try again in a moment.'}
        actions={<ActionButton label="Try again" size="sm" onPress={() => void query.refetch()} />}
      />
    )
  }
  return (
    <View style={s.stack}>
      {savedCount > 0 && staged.length === 0 ? (
        <Notice tone="ok" title="Saved" body={`The changes go live when you deploy ${envName}.`} />
      ) : null}
      <EnvironmentConfigurationView
        model={model}
        multiple={environments.length > 1}
        hostingsStatus={hostingsStatus}
        editing={editing}
        onOpenApp={(serviceId) =>
          router.push(
            projectEnvironmentServiceHref(orgId, projectId, environmentId, serviceId) as Href
          )
        }
        onOpenUrl={(url) => {
          Linking.openURL(url).catch(() => {
            // A blocked link has nothing to recover; the domain stays listed.
          })
        }}
        onManageHosting={() =>
          router.push(projectEnvironmentHostingHref(orgId, projectId, environmentId) as Href)
        }
        onOpenBase={() => router.push(projectBaseHref(orgId, projectId) as Href)}
      />
      <SaveBar
        edits={staged}
        envName={envName}
        saving={save.isPending}
        error={saveError}
        problems={problems}
        onSave={() => void saveAll()}
        onDiscard={discard}
        onUndo={unstage}
      />
    </View>
  )
}
