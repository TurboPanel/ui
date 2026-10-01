import type { RepositoryLane } from '@/lib/compose/repository-lane'
import type { RepositoryBuilder, SimpleAppConfig } from '@/lib/project-create/simple-app'

/**
 * The four "What is this?" answers and the builder settings each one stands
 * for. The wizard keeps a builder plus the Simple application's kind; the
 * operator chooses a lane. These two functions are the whole translation, so
 * the screen and the compose seed can never disagree.
 */

/** The compose lane a builder (plus what Simple produces) seeds. */
export function laneForBuilder(
  builder: RepositoryBuilder,
  kind: SimpleAppConfig['kind']
): RepositoryLane {
  if (builder === 'compose') return 'compose'
  if (builder === 'site-php') return 'site-php'
  // Railpack's card is disabled until the wizard can seed it; `simple` is the
  // only builder left, split by what it produces.
  return kind === 'static' ? 'static' : 'app'
}

/** What choosing a lane sets: the builder, and Simple's kind when it applies. */
export function builderForLane(lane: RepositoryLane): {
  builder: RepositoryBuilder
  kind?: SimpleAppConfig['kind']
} {
  if (lane === 'compose') return { builder: 'compose' }
  if (lane === 'site-php') return { builder: 'site-php' }
  return { builder: 'simple', kind: lane === 'static' ? 'static' : 'web' }
}
