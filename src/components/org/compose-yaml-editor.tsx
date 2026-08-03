/**
 * Platform entry for the Compose YAML editor.
 *
 * Metro prefers `compose-yaml-editor.web.tsx` / `.native.tsx` at bundle time.
 * This bare module exists so ESLint/`import/no-unresolved` and tools that
 * ignore platform suffixes can still resolve the import path.
 */
export { ComposeYamlEditor } from './compose-yaml-editor.native'
