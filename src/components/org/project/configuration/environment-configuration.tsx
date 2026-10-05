import { useRouter, type Href } from 'expo-router'
import { useMemo, useState } from 'react'
import { Linking, Pressable, Text, View } from 'react-native'
import {
  AppsSection,
  ChangesSection,
  DataSection,
  DomainsSection,
  LinuxUsersSection,
  VariablesSection,
} from '@/components/org/project/configuration/config-sections'
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
import { useEnvironmentConfigView } from '@/lib/queries/environments'
import { environmentDisplayName } from '@/lib/resource-labels'
import { webPointer } from '@/lib/theme'
import { buildConfigViewModel, type ConfigViewModel } from '@/lib/v4/config-view-model'

const styles = themedStyles((p) => ({
  page: { gap: 24 },
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
}: Readonly<{
  model: ConfigViewModel
  /** The project has more than one environment (the Base can differ from this one). */
  multiple: boolean
  onOpenApp: (serviceId: string) => void
  onOpenUrl: (url: string) => void
  onManageDomains: () => void
  onOpenBase: () => void
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
        />
      ) : (
        <>
          <AppsSection apps={model.apps} onOpenApp={onOpenApp} />
          <DomainsSection
            domains={model.domains}
            onOpenUrl={onOpenUrl}
            onManage={onManageDomains}
          />
          <VariablesSection variables={model.variables} envName={model.envName} />
          <LinuxUsersSection users={model.linuxUsers} />
          <DataSection data={model.data} />
        </>
      )}
    </View>
  )
}

/** Environment Configuration tab: everything this environment runs, and where each value comes from. */
export function EnvironmentConfigurationScreen() {
  const router = useRouter()
  const { orgId, projectId, environments, selectedEnvironment, pathEnvironmentId } =
    useProjectContext()
  const environmentId = pathEnvironmentId ?? selectedEnvironment?.id ?? ''
  const query = useEnvironmentConfigView(orgId, environmentId)
  const environment = environments.find((item) => item.id === environmentId)
  const envName = environment ? environmentDisplayName(environment) : 'This environment'
  const model = useMemo(
    () => (query.data ? buildConfigViewModel({ envName, view: query.data }) : null),
    [query.data, envName],
  )

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
    <EnvironmentConfigurationView
      model={model}
      multiple={environments.length > 1}
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
  )
}
