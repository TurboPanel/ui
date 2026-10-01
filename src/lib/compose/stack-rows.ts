import type { ComposeGraph } from '@/lib/compose'
import { bindingTagLabel, type ServiceBindingFacts } from '@/lib/compose/binding-facts'

/** One service as a row in the phone Overview's "Stack" list. */
export type StackRow = {
  name: string
  kind: 'service' | 'site'
  /** Image, or the repository it builds from. */
  source: string | null
  /** Hostname when one routes to it, else its published ports. */
  reach: string | null
  /** The database tag the diagram box would carry. */
  database: string | null
}

function describeSource(node: ComposeGraph['nodes'][number]): string | null {
  if (node.image) return node.image
  if (!node.gitSource) return null
  return node.gitSource.repoLabel ?? node.gitSource.branch ?? 'repository'
}

/**
 * The phone Overview lists services top to bottom instead of drawing the
 * diagram: same facts, no sideways scrolling. Order follows the diagram's
 * layers (what depends on what), then definition order.
 */
export function buildStackRows(
  graph: ComposeGraph,
  options: {
    hostnamesByService?: Readonly<Record<string, string>>
    bindingFacts?: Readonly<Record<string, ServiceBindingFacts>>
  } = {}
): StackRow[] {
  return graph.nodes
    .filter((node) => node.kind === 'service')
    .toSorted((a, b) => a.row - b.row || a.column - b.column)
    .map((node) => {
      const isSite = node.serviceKind === 'site'
      const hostname = options.hostnamesByService?.[node.name]
      const ports = node.ports?.slice(0, 2).join(', ') ?? ''
      return {
        name: node.name,
        kind: isSite ? 'site' : 'service',
        source: describeSource(node),
        reach: hostname ?? (ports || null),
        database: bindingTagLabel(options.bindingFacts?.[node.name], isSite),
      }
    })
}
