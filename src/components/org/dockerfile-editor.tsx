/**
 * Platform entry for the Dockerfile editor.
 *
 * Metro prefers `dockerfile-editor.web.tsx` / `.native.tsx` at bundle time.
 * This bare module exists so ESLint/`import/no-unresolved` and tools that
 * ignore platform suffixes can still resolve the import path.
 */
export { DockerfileEditor } from './dockerfile-editor.native'
