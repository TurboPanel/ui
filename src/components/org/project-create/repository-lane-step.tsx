import { StyleSheet, View } from 'react-native'
import { SimpleAppFields } from '@/components/org/project-create/repository-step'
import { ChoiceCard, ChoiceGrid } from '@/components/org/project-create/choice-card'
import {
  laneEvidenceLine,
  type LaneCandidate,
  type RepositoryLane,
} from '@/lib/compose/repository-lane'
import type { RepositoryInspection } from '@/lib/instance-api'
import { detectPackageManager, type SimpleAppConfig } from '@/lib/project-create/simple-app'
import { spacing } from '@/lib/theme'

const LANE_COPY: Record<RepositoryLane, { label: string; description: string }> = {
  compose: {
    label: 'Compose',
    description: "Use the repository's own compose file, unchanged.",
  },
  'site-php': {
    label: 'PHP site',
    description: 'A PHP or WordPress site, served by a web engine with PHP.',
  },
  app: {
    label: 'App',
    description: 'A Node, Deno, or Python app: built and run for you.',
  },
  static: {
    label: 'Static site',
    description: 'Plain HTML, or a pre-built frontend.',
  },
}

/**
 * Wizard step after the repository is read: "What is this?". All four answers
 * always show, in a fixed order, each with the evidence for or against it.
 * Choosing App or Static Site reveals the build settings underneath.
 */
export function RepositoryLaneStep({
  candidates,
  selectedLane,
  inspection,
  simple,
  disabled = false,
  onSelectLane,
  onSimpleChange,
}: Readonly<{
  candidates: readonly LaneCandidate[]
  selectedLane: RepositoryLane | null
  inspection: RepositoryInspection | undefined
  simple: SimpleAppConfig
  disabled?: boolean
  onSelectLane: (lane: RepositoryLane) => void
  onSimpleChange: (patch: Partial<SimpleAppConfig>) => void
}>) {
  const showSimple = selectedLane === 'app' || selectedLane === 'static'
  return (
    <View style={styles.root}>
      <ChoiceGrid>
        {candidates.map((candidate) => (
          <ChoiceCard
            key={candidate.lane}
            label={LANE_COPY[candidate.lane].label}
            description={LANE_COPY[candidate.lane].description}
            badge={laneEvidenceLine(candidate)}
            selected={selectedLane === candidate.lane}
            disabled={disabled}
            onPress={() => {
              onSelectLane(candidate.lane)
            }}
          />
        ))}
      </ChoiceGrid>
      {showSimple ? (
        <SimpleAppFields
          simple={simple}
          manager={inspection ? detectPackageManager(inspection.files)?.manager : undefined}
          disabled={disabled}
          onSimpleChange={onSimpleChange}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
})
