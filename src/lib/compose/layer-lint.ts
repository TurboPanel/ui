import { yamlToComposeDocument } from './convert'
import {
  hideComposeTurbopanelExtensions,
  restoreComposeTurbopanelExtensions,
} from './hidden-extension'
import { composeDocumentToYaml, mergeComposeOverlay, type ComposeDocument } from './index'
import { lintComposeYaml, type ComposeLintIssue, type ComposeLintOptions } from './lint'

/**
 * The layers an environment's changes sit between, in merge order: the
 * project's Base and its extra overlay files before, the environment's own
 * extra overlay files after. Mirrors the control plane's layer chain so a
 * `build:` that only an overlay file gives a service still counts.
 */
export type EnvironmentBaseLayers = {
  before: readonly unknown[]
  after: readonly unknown[]
}

function overlayDocuments(options: unknown): unknown[] {
  if (typeof options !== 'object' || options === null) return []
  const raw = (options as { composeOverlays?: unknown }).composeOverlays
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry: unknown) =>
    typeof entry === 'object' && entry !== null
      ? [(entry as { document?: unknown }).document ?? null]
      : []
  )
}

/** Collect the layers around an environment's own `options.compose`. */
export function environmentBaseLayers(
  projectOptions: unknown,
  environmentOptions: unknown
): EnvironmentBaseLayers {
  const projectCompose =
    typeof projectOptions === 'object' && projectOptions !== null
      ? ((projectOptions as { compose?: unknown }).compose ?? null)
      : null
  return {
    before: [projectCompose, ...overlayDocuments(projectOptions)],
    after: overlayDocuments(environmentOptions),
  }
}

/**
 * Lint an environment's changes the way the instance does: the layer alone as a
 * partial document (it may set one field of a service the project's Base
 * defines, so it need not name an `image` or `build`), then the merge of the
 * Base layers, this layer and the extra environment overlays, where "every
 * Docker service has an image or build" is asked in full.
 *
 * `layerSource` is the text the editor shows (line numbers match it); the layer
 * document supplies the merge, so hidden `x-turbopanel` blocks still count. A
 * merge issue has no line, since the merged text is not what the operator sees.
 *
 * `base` is `null` while the project's Base has not loaded: the save stays
 * blocked, with a plain note instead of a missing-image error the Base might
 * answer.
 */
export function lintEnvironmentLayer(
  layerSource: string,
  layerDocument: unknown,
  base: EnvironmentBaseLayers | null,
  options?: ComposeLintOptions
): ComposeLintIssue[] {
  const layerIssues = lintComposeYaml(layerSource, { ...options, requireImageOrBuild: false })
  // An empty layer, or one that does not parse, has nothing to merge.
  if (layerSource.trim() === '' || layerIssues.some((issue) => issue.path === '$')) {
    return layerIssues
  }
  if (base === null) {
    return [
      ...layerIssues,
      {
        level: 'error',
        message: "Waiting for the project's Base to load",
        code: 'base_not_loaded',
        path: '$',
      },
    ]
  }
  let mergedYaml: string
  try {
    let merged: unknown = null
    for (const layer of [...base.before, layerDocument, ...base.after]) {
      merged = mergeComposeOverlay(merged, layer)
    }
    mergedYaml = composeDocumentToYaml(merged as ReturnType<typeof mergeComposeOverlay>)
  } catch {
    return layerIssues
  }
  const mergedIssues = lintComposeYaml(mergedYaml, { merged: true }).filter(
    (issue) => issue.code === 'service_missing_image_or_build'
  )
  return [
    ...layerIssues,
    ...mergedIssues.map((issue): ComposeLintIssue => ({
      level: issue.level,
      message: issue.message,
      code: issue.code,
      path: issue.path,
    })),
  ]
}

/**
 * The full document behind the YAML tab: the visible text re-joined with the
 * platform shadow the tab never showed. `null` when the text will not parse.
 */
export function draftFromYaml(yamlText: string, draft: ComposeDocument): ComposeDocument | null {
  try {
    return restoreComposeTurbopanelExtensions(
      yamlToComposeDocument(yamlText),
      hideComposeTurbopanelExtensions(draft).hidden
    )
  } catch {
    return null
  }
}
