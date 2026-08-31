/**
 * The `x-turbopanel.hosting` entry the hosting editor writes back for one row.
 *
 * Extracted out of `components/org/environment-detail-section.tsx` for one
 * reason: this is the panel's *write* path into a compose document, and a write
 * path that only exists inside a React Native screen cannot be pinned by a
 * test. The screen keeps the state and the controls; what an edit becomes on
 * disk is decided here.
 */

import type { ComposeHostingExtensionEntry } from './hosting-extension'
import { hostingTargetPortAuthorable } from './hosting-extension'
import type { ComposeServiceKind } from './service-kind'

/** `a.example, b.example` → `['a.example', 'b.example']`. */
export function parseHostnameList(value: string): string[] {
  return value
    .split(',')
    .map((hostname) => hostname.trim())
    .filter(Boolean)
}

/**
 * The editor fields a compose entry is built from.
 *
 * A structural subset of the screen's `HostingEditorState`, not an import of
 * it: the panel-only fields (proxy toggles, web env, raw tcp/udp publishes)
 * have no compose spelling and stay on the hosting row, so naming them here
 * would suggest this function could write them.
 */
export type ComposeHostingEditorFields = {
  hostnames: string
  pathPrefix: string
  targetPort: string
  forceHttps: boolean
  tlsId: string | null
  ipId: string | null
  bind: 'public' | 'datacenter' | 'local'
}

/**
 * Build the entry to write back for one edited compose row.
 *
 * Only the keys compose actually authors, and only when they say something:
 * omitting `pathPrefix` means `/` and omitting `targetPort` means "no pinned
 * target", so writing the defaults out would turn every save into a diff.
 *
 * `targetPort` is dropped outright on the kinds that may not author one
 * ({@link hostingTargetPortAuthorable}) — both host-native kinds are answered
 * by a host process on a loopback port the daemon allocates, and the control
 * plane refuses a pinned one on save. `serviceKind` is passed rather than
 * derived so a caller cannot quietly answer `node` as `container`, which is
 * exactly the bug that let the editor author a `targetPort` deploy would then
 * reject.
 */
export function composeHostingEntryFromEditorFields(
  editor: ComposeHostingEditorFields,
  serviceKind: ComposeServiceKind | undefined,
): ComposeHostingExtensionEntry | null {
  const hostname = parseHostnameList(editor.hostnames)[0]?.toLowerCase()
  if (!hostname) return null

  const entry: ComposeHostingExtensionEntry = { hostname }
  const pathPrefix = editor.pathPrefix.trim()
  if (pathPrefix && pathPrefix !== '/') entry.pathPrefix = pathPrefix

  const targetPort = Number.parseInt(editor.targetPort.trim(), 10)
  if (
    hostingTargetPortAuthorable(serviceKind) &&
    Number.isInteger(targetPort) && targetPort >= 1 && targetPort <= 65535
  ) {
    entry.targetPort = targetPort
  }

  if (!editor.forceHttps) entry.forceHttps = false

  entry.tls = editor.tlsId
    ? { mode: 'certificate', certificateRef: editor.tlsId }
    : { mode: 'internal' }

  entry.bind = {
    scope: editor.bind,
    ...(editor.bind === 'public' && editor.ipId ? { ipRef: editor.ipId } : {}),
  }

  return entry
}
