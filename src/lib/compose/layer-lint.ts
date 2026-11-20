import { composeDocumentToYaml, mergeComposeOverlay } from './index'
import { lintComposeYaml, type ComposeLintIssue, type ComposeLintOptions } from './lint'

/**
 * Lint an environment's changes the way the instance does: the layer alone as a
 * partial document (it may set one field of a service the project's Base
 * defines, so it need not name an `image` or `build`), then the merge of the
 * Base and the layer, where "every Docker service has an image or build" is
 * asked in full.
 *
 * `layerSource` is the text the editor shows (line numbers match it); the layer
 * document supplies the merge, so hidden `x-turbopanel` blocks still count. A
 * merge issue has no line, since the merged text is not what the operator sees.
 */
export function lintEnvironmentLayer(
  layerSource: string,
  layerDocument: unknown,
  baseDocument: unknown,
  options?: ComposeLintOptions
): ComposeLintIssue[] {
  const layerIssues = lintComposeYaml(layerSource, { ...options, requireImageOrBuild: false })
  // An empty layer, or one that does not parse, has nothing to merge.
  if (layerSource.trim() === '' || layerIssues.some((issue) => issue.path === '$')) {
    return layerIssues
  }
  let mergedYaml: string
  try {
    mergedYaml = composeDocumentToYaml(mergeComposeOverlay(baseDocument, layerDocument))
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
