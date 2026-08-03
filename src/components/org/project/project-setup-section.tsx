import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { SectionPanel } from '@/components/org/section-panel'
import { WizardStepIndicator } from '@/components/org/wizard-step-indicator'
import { orgPanelStyles, webPointer } from '@/components/org/org-panel-styles'
import { useProjectContext } from '@/components/org/project/project-context'
import {
  configureProject,
  fetchProjectCatalog,
  isForbiddenError,
  type CatalogSummary,
} from '@/lib/instance-api'
import {
  managedCatalogEntryForCode,
  sortManagedCatalogEntries,
  type ManagedEngineAvailability,
} from '@/lib/managed-services'
import { useOrgDefaultEnvironmentName } from '@/lib/org-default-environment'
import { projectOverviewHref } from '@/lib/project-navigation'
import { useAuth } from '@/lib/auth-context'
import { chrome, colors, spacing } from '@/lib/theme'

type SetupType = 'docker-compose' | 'template' | 'managed'
type Step = 'type' | 'catalog'

const TYPE_OPTIONS: {
  type: SetupType
  label: string
  description: string
}[] = [
  {
    type: 'docker-compose',
    label: 'Docker Compose',
    description: 'Define a base stack once and override per environment.',
  },
  {
    type: 'template',
    label: 'From Template',
    description: 'Start from a catalog template with sensible defaults.',
  },
  {
    type: 'managed',
    label: 'Managed Service',
    description: 'Managed databases and engines (Postgres first).',
  },
]

export function ProjectSetupSection() {
  const router = useRouter()
  const { handleUnauthorized } = useAuth()
  const {
    orgId,
    projectId,
    project,
    environments,
    canManage,
    needsSetup,
    refreshProject,
    setError,
  } = useProjectContext()
  const { defaultEnvironmentName } = useOrgDefaultEnvironmentName(orgId)
  const scaffoldedEnvironmentName =
    environments.find((env) => env.description === 'Default environment')
      ?.displayName?.trim() ||
    (environments.length === 1
      ? environments[0]?.displayName?.trim()
      : undefined) ||
    defaultEnvironmentName

  const [step, setStep] = useState<Step>('type')
  const [selectedType, setSelectedType] = useState<SetupType | null>(null)
  const [catalog, setCatalog] = useState<CatalogSummary[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (!needsSetup && project) {
      router.replace(
        projectOverviewHref(orgId, projectId) as Href,
      )
    }
  }, [needsSetup, project, orgId, projectId, router])

  useEffect(() => {
    if (step !== 'catalog' || !selectedType) return
    let cancelled = false
    const load = async () => {
      setLoadingCatalog(true)
      setLocalError(null)
      try {
        const result = await fetchProjectCatalog()
        if (cancelled) return
        const filtered = result.catalog.filter((entry) => {
          if (selectedType === 'template') return entry.kind === 'template'
          if (selectedType === 'managed') {
            return (
              entry.kind === 'managed' &&
              managedCatalogEntryForCode(entry.code) !== undefined
            )
          }
          return false
        })
        setCatalog(
          selectedType === 'managed'
            ? sortManagedCatalogEntries(filtered)
            : filtered.toSorted((a, b) =>
                a.displayName.localeCompare(b.displayName),
              ),
        )
      } catch (err) {
        if (cancelled) return
        if (isForbiddenError(err)) {
          await handleUnauthorized()
          return
        }
        setLocalError(
          err instanceof Error ? err.message : 'Failed to load catalog',
        )
      } finally {
        if (!cancelled) setLoadingCatalog(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [step, selectedType, handleUnauthorized])

  const finish = async (type: SetupType, code?: string) => {
    if (!canManage) {
      setLocalError('You need manage permission to finish setup.')
      return
    }
    setSubmitting(true)
    setLocalError(null)
    setError(null)
    try {
      await configureProject(projectId, {
        type,
        ...(code ? { code } : {}),
      })
      await refreshProject()
      router.replace(
        projectOverviewHref(orgId, projectId) as Href,
      )
    } catch (err) {
      if (isForbiddenError(err)) {
        await handleUnauthorized()
        return
      }
      setLocalError(
        err instanceof Error ? err.message : 'Failed to configure project',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const onSelectType = (type: SetupType) => {
    setSelectedType(type)
    if (type === 'docker-compose') {
      void finish('docker-compose')
      return
    }
    setStep('catalog')
  }

  const availability = (code: string): ManagedEngineAvailability => {
    const entry = managedCatalogEntryForCode(code)
    return entry?.status ?? 'coming-soon'
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <WizardStepIndicator
        labels={
          selectedType === 'docker-compose' || selectedType === null
            ? ['Type']
            : ['Type', 'Catalog']
        }
        activeIndex={step === 'type' ? 0 : 1}
      />

      <SectionPanel
        title="Finish project setup"
        hint={`${scaffoldedEnvironmentName} already exists. Choose how this project runs — you can leave and resume anytime.`}
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

        {step === 'type' ? (
          <View style={styles.typeGrid}>
            {TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                style={[styles.typeCard, webPointer, submitting && styles.disabled]}
                disabled={submitting || !canManage}
                onPress={() => onSelectType(option.type)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
              >
                <Text style={styles.typeLabel}>{option.label}</Text>
                <Text style={styles.typeDescription}>{option.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {step === 'catalog' ? (
          <View style={styles.catalog}>
            <Pressable
              style={[orgPanelStyles.toolbarBtnSecondary, webPointer]}
              onPress={() => {
                setStep('type')
                setSelectedType(null)
              }}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Back to type"
            >
              <Text style={orgPanelStyles.toolbarBtnTextSecondary}>← Back</Text>
            </Pressable>
            {loadingCatalog ? (
              <ActivityIndicator color={chrome.accent} />
            ) : (
              <View style={styles.typeGrid}>
                {catalog.map((entry) => {
                  const avail =
                    selectedType === 'managed'
                      ? availability(entry.code)
                      : 'available'
                  const disabled =
                    submitting ||
                    !canManage ||
                    (selectedType === 'managed' && avail !== 'available')
                  return (
                    <Pressable
                      key={entry.code}
                      style={[
                        styles.typeCard,
                        webPointer,
                        disabled && styles.disabled,
                      ]}
                      disabled={disabled}
                      onPress={() => {
                        if (!selectedType || selectedType === 'docker-compose') {
                          return
                        }
                        void finish(selectedType, entry.code)
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={entry.displayName}
                    >
                      <Text style={styles.typeLabel}>{entry.displayName}</Text>
                      <Text style={styles.typeDescription}>
                        {entry.description}
                      </Text>
                      {selectedType === 'managed' && avail !== 'available' ? (
                        <Text style={styles.comingSoon}>Coming soon</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        ) : null}

        {submitting ? (
          <Text style={orgPanelStyles.muted}>Configuring…</Text>
        ) : null}
      </SectionPanel>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  typeGrid: {
    gap: spacing.sm,
  },
  typeCard: {
    borderWidth: 1,
    borderColor: colors.borderChip,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    padding: spacing.md,
    minHeight: 72,
    gap: spacing.xs,
  },
  typeLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  typeDescription: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  catalog: {
    gap: spacing.md,
  },
  comingSoon: {
    color: colors.pending,
    fontSize: 12,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.55,
  },
})
