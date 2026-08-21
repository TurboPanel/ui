import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { SectionPanel } from '@/components/org/section-panel'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import { CatalogStep } from '@/components/org/project-create/catalog-step'
import {
  ChoiceCard,
  ChoiceGrid,
} from '@/components/org/project-create/choice-card'
import {
  SETUP_TYPE_OPTIONS,
  type SetupType,
} from '@/components/org/project-create/setup-types'
import { Button, ButtonRow } from '@/components/ui'
import { useConfigureProject, useProjectCatalog } from '@/lib/queries'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectOverviewHref } from '@/lib/project-navigation'
import { spacing } from '@/lib/theme'

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

  const [selectedType, setSelectedType] = useState<SetupType | null>(null)
  const [selectedCode, setSelectedCode] = useState('')
  const configureProject = useConfigureProject(orgId, projectId)

  const catalogQuery = useProjectCatalog(orgId, {
    enabled: selectedType != null && selectedType !== 'docker-compose',
  })

  const localError =
    catalogQuery.error instanceof Error
      ? catalogQuery.error.message
      : configureProject.actionError

  useEffect(() => {
    if (!needsSetup && project) {
      router.replace(projectOverviewHref(orgId, projectId) as Href)
    }
  }, [needsSetup, project, orgId, projectId, router])

  const finish = async () => {
    if (!selectedType) return
    if (!canManage) {
      setError('You need manage permission to finish setup.')
      return
    }
    setError(null)
    const result = await configureProject.run({
      type: selectedType,
      ...(selectedCode ? { code: selectedCode } : {}),
    })
    if (!result.ok) {
      if (configureProject.actionError) {
        setError(configureProject.actionError)
      }
      return
    }
    router.replace(projectOverviewHref(orgId, projectId) as Href)
  }

  const needsCode = selectedType != null && selectedType !== 'docker-compose'
  const canFinish =
    canManage &&
    selectedType != null &&
    (!needsCode || selectedCode.length > 0) &&
    !configureProject.isPending

  return (
    <ScrollView contentContainerStyle={styles.root}>
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
          {SETUP_TYPE_OPTIONS.map((option) => (
            <ChoiceCard
              key={option.type}
              label={option.label}
              description={option.description}
              selected={selectedType === option.type}
              disabled={configureProject.isPending || !canManage}
              onPress={() => {
                setSelectedType(option.type)
                setSelectedCode('')
              }}
            />
          ))}
        </ChoiceGrid>

        {needsCode && selectedType ? (
          <CatalogStep
            type={selectedType}
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
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
})
