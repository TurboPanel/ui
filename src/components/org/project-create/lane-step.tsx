import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { orgPanelStyles } from '@/components/org/org-panel-styles'
import { ChoiceCard, ChoiceGrid } from '@/components/org/project-create/choice-card'
import { InlineNotice, LoadingState } from '@/components/ui'
import {
  rankRepositoryLanes,
  recommendedLane,
  type LaneCandidate,
  type RepositoryLane,
} from '@/lib/compose/repository-lane'
import type { RepositoryInspection } from '@/lib/instance-api'
import { spacing } from '@/lib/theme'

/**
 * What each lane is, in the operator's terms.
 *
 * Named by what they do, never by vintage. A container is not more modern than
 * a php-fpm pool — it is a different way to serve a request, and this is the
 * screen where that has to read as true.
 */
const LANE_COPY: Record<RepositoryLane, { label: string; description: string }> = {
  compose: {
    label: 'Compose',
    description:
      "Use the compose file already in this repository as the project's compose. You can edit it before creating.",
  },
  'site-php': {
    label: 'PHP site',
    description:
      'Serve this repository with a web engine and PHP — WordPress, Laravel, or anything else expecting php-fpm.',
  },
  app: {
    label: 'App',
    description:
      'Run this repository as a process on the host under its own system user, built and promoted on each deploy.',
  },
  static: {
    label: 'Static site',
    description:
      'Serve this repository as files. Caddy handles it with nothing to configure.',
  },
}

/** Fixed display order, independent of ranking — the list must not reshuffle. */
const LANE_ORDER: readonly RepositoryLane[] = [
  'compose',
  'site-php',
  'app',
  'static',
]

/**
 * Second half of the repository step: what should TurboPanel do with this repo?
 *
 * **Detect, then confirm.** The ranking picks a default, but every lane stays
 * visible and every card states the evidence that chose it — including its
 * absence ("no package.json found"). A repository can hold a Dockerfile *and* a
 * package.json *and* a public/index.html; intent is not in the files, so the
 * operator decides. Showing the evidence is what makes that an informed
 * decision rather than a guess between four blank options.
 *
 * Cards keep a **fixed order** even though the ranking changes: a list that
 * reshuffles as the read completes is disorienting, and "Detected" already
 * says which one won.
 */
export function LaneStep({
  inspection,
  loading,
  error,
  selectedLane,
  onSelectLane,
  disabled = false,
}: Readonly<{
  inspection: RepositoryInspection | undefined
  loading: boolean
  error: Error | null
  selectedLane: RepositoryLane | null
  onSelectLane: (lane: RepositoryLane) => void
  disabled?: boolean
}>) {
  const candidates = useMemo<LaneCandidate[]>(
    () => rankRepositoryLanes(inspection?.files ?? [], inspection?.entries ?? []),
    [inspection],
  )
  const byLane = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.lane, candidate])),
    [candidates],
  )
  const detected = recommendedLane(candidates)
  // A failed read is not a dead end — every lane still works, the operator just
  // picks without evidence. Blocking a project over a provider hiccup would be
  // worse than asking.
  const readable = !error && inspection !== undefined

  if (loading) return <LoadingState label="Reading the repository…" />

  return (
    <View style={styles.root}>
      {error ? (
        <InlineNotice
          title="Could not read the repository"
          body={`${error.message} You can still choose how to run it.`}
        />
      ) : (
        <Text style={orgPanelStyles.muted}>
          {detected
            ? 'Picked from what is in the repository. Change it if that is not what you want.'
            : 'Nothing in the repository points at one of these, so pick the one you want.'}
        </Text>
      )}

      <ChoiceGrid>
        {LANE_ORDER.map((lane) => {
          const candidate = byLane.get(lane)
          const copy = LANE_COPY[lane]
          return (
            <ChoiceCard
              key={lane}
              label={copy.label}
              description={copy.description}
              selected={selectedLane === lane}
              disabled={disabled}
              badge={readable && candidate ? evidenceBadge(candidate) : undefined}
              onPress={() => onSelectLane(lane)}
            />
          )
        })}
      </ChoiceGrid>
    </View>
  )
}

/** `docker-compose.yml` when found, `no package.json found` when not. */
function evidenceBadge(candidate: LaneCandidate): string {
  return candidate.recommended
    ? `Detected · ${candidate.evidence}`
    : candidate.evidence
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
})
