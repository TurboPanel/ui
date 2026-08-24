import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import { ChoiceGrid } from '@/components/org/project-create/choice-card'
import { SetupTypeChoiceCard } from '@/components/org/project-create/setup-type-icons'
import {
  SETUP_TYPE_OPTIONS,
  setupOptionForChoice,
  type SetupChoice,
} from '@/components/org/project-create/setup-types'
import { Button, ButtonRow } from '@/components/ui'
import { useConfigureProject, useProjectCatalog } from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectComposeSectionHref } from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

/**
 * Cards resumable setup can honour.
 *
 * **Git repository is filtered out on purpose.** This flow configures a row
 * that already exists through `configureProject`, whose body is `{ type, code }`
 * — there is no `options.compose` on it, so a repository binding has nowhere to
 * go, and this surface has no compose draft step to put one in. Offering the
 * card would set the project to `docker-compose` and silently drop the
 * repository, which is worse than not offering it: an operator who lands here
 * picks Compose or Services and binds the repository on the service itself.
 */
const RESUMABLE_SETUP_OPTIONS = SETUP_TYPE_OPTIONS.filter(
  (option) => option.choice !== 'repository',
)

/**
 * Resumable setup for projects that exist without a type — the create wizard
 * now picks the type before the project is written, so this only serves
 * projects created empty earlier (or left mid-setup). Selection is local until
 * Finish setup, matching the wizard: a mis-clicked card costs nothing.
 */
export function ProjectSetupSection() {
  const router = useRouter()
  const {
    orgId,
    projectId,
    project,
    environments,
    canManage,
    needsSetup,
    setError,
  } = useProjectContext()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)
  const scaffoldedEnvironmentName =
    environments.find((env) => env.description === 'Default environment')
      ?.name?.trim() ||
    (environments.length === 1 ? environments[0]?.name?.trim() : undefined) ||
    defaultEnvironmentName

  const [selectedChoice, setSelectedChoice] = useState<SetupChoice | null>(
    null,
  )
  const selectedOption = selectedChoice
    ? setupOptionForChoice(selectedChoice) ?? null
    : null
  const [selectedCode, setSelectedCode] = useState('')
  const configureProject = useConfigureProject(orgId, projectId)

  const catalogQuery = useProjectCatalog(orgId, {
    enabled:
      selectedOption != null && selectedOption.type !== 'docker-compose',
  })

  const localError =
    catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : configureProject.actionError

  // Where setup hands off. Services lands on the Services tab so the operator
  // continues in the surface they picked; everything else lands on Overview.
  const landingSection = selectedOption?.section ?? 'overview'
  const landingHref = projectComposeSectionHref(
    orgId,
    projectId,
    landingSection,
  ) as Href

  useEffect(() => {
    if (!needsSetup && project) {
      router.replace(landingHref)
    }
  }, [needsSetup, project, router, landingHref])

  const finish = async () => {
    if (!selectedOption) return
    if (!canManage) {
      setError('You need manage permission to finish setup.')
      return
    }
    setError(null)
    const result = await configureProject.run({
      type: selectedOption.type,
      ...(selectedCode ? { code: selectedCode } : {}),
    })
    if (!result.ok) {
      if (configureProject.actionError) {
        setError(configureProject.actionError)
      }
      return
    }
    router.replace(landingHref)
  }

  const needsCode =
    selectedOption != null && selectedOption.type !== 'docker-compose'
  const canFinish =
    canManage &&
    selectedOption != null &&
    (!needsCode || selectedCode.length > 0) &&
    !configureProject.isPending

  return (
    <View style={styles.root}>
      <SectionPanel
        title="Finish project setup"
        hint={`${scaffoldedEnvironmentName} already exists. Choose how this project runs — nothing changes until you finish.`}
        accent
      >
        {localError ? (
          <Text style={orgPanelStyles.error}>{localError}</Text>
        ) : null}

        {!canManage ? (
          <Text style={orgPanelStyles.muted}>
            Ask an organization manager to finish setup.
          </Text>
        ) : null}

        <ChoiceGrid>
          {RESUMABLE_SETUP_OPTIONS.map((option) => (
            <SetupTypeChoiceCard
              key={option.choice}
              option={option}
              selected={selectedChoice === option.choice}
              disabled={configureProject.isPending || !canManage}
              onPress={() => {
                setSelectedChoice(option.choice)
                setSelectedCode('')
              }}
            />
          ))}
        </ChoiceGrid>

        {needsCode && selectedOption && selectedOption.type !== 'docker-compose' ? (
          <CatalogStep
            type={selectedOption.type}
            catalog={catalogQuery.data?.catalog ?? []}
            loading={catalogQuery.isLoading}
            selectedCode={selectedCode}
            disabled={configureProject.isPending || !canManage}
            onSelect={setSelectedCode}
          />
        ) : null}

        <ButtonRow>
          <Button
            label="Finish setup"
            busyLabel="Configuring…"
            variant="primary"
            busy={configureProject.isPending}
            disabled={!canFinish}
            onPress={() => {
              void finish()
            }}
            accessibilityLabel="Finish setup"
          />
        </ButtonRow>
      </SectionPanel>
    </View>
  )
}

const styles = StyleSheet.create({
  // Plain View, not a ScrollView: `OrgScreenScroll` already scrolls this screen
  // and owns its insets. A nested vertical scroll is unbounded on native.
  root: {
    gap: spacing.lg,
  },
})
