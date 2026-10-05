import { useRouter, type Href } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import {
  AppsSection,
  ChangesSection,
  DataSection,
  DomainsSection,
  LinuxUsersSection,
  VariablesSection,
} from '@/components/org/project/configuration/config-sections'
import type { EditingApi } from '@/components/org/project/configuration/editing'
import { SaveBar } from '@/components/org/project/configuration/save-bar'
import { useProjectContext } from '@/components/org/project/project-context'
import { LoadingState } from '@/components/ui'
import { ActionButton, Notice } from '@/components/ui/v4'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { typeStyle } from '@/components/ui/v4/type-styles'
import {
  projectBaseHref,
  projectEnvironmentHostingHref,
  projectServiceHref,
} from '@/lib/project-navigation'
import { useSaveConfiguration } from '@/lib/queries/configuration'
import { useEnvironmentConfigView } from '@/lib/queries/environments'
import { useVariables } from '@/lib/queries/variables'
import { environmentDisplayName } from '@/lib/resource-labels'
import { webPointer } from '@/lib/theme'
import {
  changeActions,
  environmentDetachedFromBase,
  scopeDecision,
  stageEdit,
  unstageEdit,
  variableFacts,
  type SaveProblem,
  type StagedEdit,
} from '@/lib/v4/config-edits'
import { buildConfigViewModel, type ConfigViewModel } from '@/lib/v4/config-view-model'

const styles = themedStyles((p) => ({
  page: { gap: 24 },
  stack: { gap: 16 },
  lede: { ...typeStyle('body', 'subhead'), color: p.text3 },
  top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface,
  },
  filterText: { ...typeStyle('bodyMedium', 'subhead'), color: p.text },
  track: {
    width: 28,
    height: 16,
    borderRadius: 8,
    padding: 2,
    backgroundColor: p.surface3,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: p.accent },
  knob: { width: 12, height: 12, borderRadius: 6, backgroundColor: p.knob },
  knobOn: { alignSelf: 'flex-end' },
}))

/** The "Only changes from Base (N)" switch. */
function OnlyChangesSwitch({
  label,
  on,
  onToggle,
}: Readonly<{ label: string; on: boolean; onToggle: () => void }>) {
  const s = styles(usePalette())
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onToggle}
      style={[s.filter, webPointer]}
    >
      <View style={[s.track, on && s.trackOn]}>
        <View style={[s.knob, on && s.knobOn]} />
      </View>
      <Text style={s.filterText}>{label}</Text>
    </Pressable>
  )
}

function lede(model: ConfigViewModel): string {
  if (model.followsBase) return `${model.envName} runs the Base plus its own changes.`
  return `${model.envName} stands alone: it keeps its own settings and does not follow the Base.`
}

/** The tab body once the config-view answer is in. Presentational: links go through the callbacks. */
export function EnvironmentConfigurationView({
  model,
  multiple,
  onOpenApp,
  onOpenUrl,
  onManageDomains,
  onOpenBase,
  editing,
}: Readonly<{
  model: ConfigViewModel
  /** The project has more than one environment (the Base can differ from this one). */
  multiple: boolean
  onOpenApp: (serviceId: string) => void
  onOpenUrl: (url: string) => void
  onManageDomains: () => void
  onOpenBase: () => void
  /** Present when the person can edit; absent means every row is read-only. */
  editing?: EditingApi
}>) {
  const s = styles(usePalette())
  const [only, setOnly] = useState(false)
  const filtering = multiple && only
  return (
    <View style={s.page}>
      {multiple ? (
        <>
          <Text style={s.lede}>{lede(model)}</Text>
          <View style={s.top}>
            <OnlyChangesSwitch
              label={model.onlyChangesLabel}
              on={only}
              onToggle={() => setOnly((value) => !value)}
            />
          </View>
        </>
      ) : (
        <Notice
          title="This project has one environment"
          body="Changes here are saved in the Base. Add a second environment to give it changes of its own."
          actions={<ActionButton label="Open the Base" size="sm" onPress={onOpenBase} />}
        />
      )}
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
          <DomainsSection
            domains={model.domains}
            onOpenUrl={onOpenUrl}
            onManage={onManageDomains}
          />
          <VariablesSection
            variables={model.variables}
            envName={model.envName}
            editing={editing}
          />
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
  const model = useMemo(
    () => (query.data ? buildConfigViewModel({ envName, view: query.data }) : null),
    [query.data, envName],
  )
  const [staged, setStaged] = useState<readonly StagedEdit[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [problems, setProblems] = useState<readonly SaveProblem[]>([])
  const [savedCount, setSavedCount] = useState(0)

  const stage = useCallback((edit: StagedEdit) => {
    setStaged((current) => stageEdit(current, edit))
    setSavedCount(0)
  }, [])
  const unstage = useCallback((key: string) => setStaged((current) => unstageEdit(current, key)), [])
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
      scopeMode: scopeDecision(environments.length, model.followsBase),
      others: environments
        .filter((item) => item.id !== environmentId)
        .map((item) => ({
          name: environmentDisplayName(item),
          standsAlone: environmentDetachedFromBase(item.options?.compose),
        })),
      linuxUserNames: model.linuxUserNames,
      variableFacts: (name) => variableFacts(name, envVariableRecords, projectVariableRecords),
      actionsFor: (change) => changeActions(change, envVariableRecords, model.followsBase),
      onStage: stage,
      onUnstage: unstage,
    }
  }, [
    editable,
    model,
    envVariableRecords,
    projectVariableRecords,
    envName,
    staged,
    environments,
    environmentId,
    stage,
    unstage,
  ])

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
        <Notice
          tone="ok"
          title="Saved"
          body={`The changes go live when you deploy ${envName}.`}
        />
      ) : null}
      <EnvironmentConfigurationView
        model={model}
        multiple={environments.length > 1}
        editing={editing}
        onOpenApp={(serviceId) => router.push(projectServiceHref(orgId, projectId, serviceId) as Href)}
        onOpenUrl={(url) => {
          Linking.openURL(url).catch(() => {
            // A blocked link has nothing to recover; the domain stays listed.
          })
        }}
        onManageDomains={() =>
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
