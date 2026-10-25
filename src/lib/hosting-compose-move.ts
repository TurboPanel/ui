/**
 * The two actions a hostname set in an environment's configuration file gets
 * on the Hosting screen, as pure rules the screen calls:
 *
 * - **Remove hostname** drops the entry from the environment's file
 *   ({@link withoutComposeHostingRoute}); the next deploy removes the hosting
 *   it made (or hands back one the panel made first).
 * - **Manage on this screen instead** moves it to an ordinary panel hosting.
 *   A hosting the last deploy already made is released to the panel first
 *   (`POST /hostings/:id/release-from-compose`), then the entry is dropped;
 *   one never deployed is created in the panel with the same certificate
 *   choice ({@link panelCertificateForMovedRoute}), then the entry is dropped.
 */
import {
  findComposeHostingEntryIndex,
  readComposeHostingEntries,
  writeComposeHostingEntries,
} from '@/lib/compose/hosting-service-context'
import { hostingEntryKey, type ComposeHostingExtensionEntry } from '@/lib/compose/hosting-extension'
import type { ComposeDocument } from '@/lib/compose/types'
import { isAdoptedComposeHosting, isComposeOwnedHosting } from '@/lib/hosting-compose-owner'
import { resolveCertificateRef, type ConfiguredHostingState } from '@/lib/hosting-plain-words'
import type { TlsRecord } from '@/lib/instance-api'

/**
 * `document` without the entry for `route` on one service, or null when the
 * document does not hold it (an entry the project's shared file sets is not
 * in the environment's file, so it cannot be removed from there).
 */
export function withoutComposeHostingRoute(
  document: ComposeDocument,
  composeServiceName: string,
  route: string
): ComposeDocument | null {
  const entries = readComposeHostingEntries(document, composeServiceName)
  const index = findComposeHostingEntryIndex(entries, route)
  if (index === -1) return null
  return writeComposeHostingEntries(
    document,
    composeServiceName,
    entries.filter((_, position) => position !== index)
  )
}

export type MovedRouteCertificate = Readonly<{
  tlsId: string | null
  getLetsEncrypt: boolean
  /**
   * The certificate the file names when the library does not have it. The move
   * stops and says so rather than quietly falling back to self-signed.
   */
  missingRef: string | null
}>

/**
 * The certificate a hostname keeps when it moves to the panel before any
 * deploy made its hosting: the same library certificate (named by id or name
 * in the file), or a Let's Encrypt request right after the save.
 */
export function panelCertificateForMovedRoute(
  entry: Pick<ComposeHostingExtensionEntry, 'tls'>,
  library: readonly TlsRecord[]
): MovedRouteCertificate {
  const mode = entry.tls?.mode
  if (mode === 'automatic') return { tlsId: null, getLetsEncrypt: true, missingRef: null }
  if (mode === 'certificate') {
    const ref = entry.tls?.certificateRef ?? ''
    const row = resolveCertificateRef(ref, library)
    return { tlsId: row?.id ?? null, getLetsEncrypt: false, missingRef: row ? null : ref }
  }
  return { tlsId: null, getLetsEncrypt: false, missingRef: null }
}

/** The steps a move to the panel runs; each says why itself when it fails. */
export type MoveToPanelSteps = Readonly<{
  /** Hand the deployed hosting back to the panel. Answers whether it worked. */
  release: (hostingId: string) => Promise<boolean>
  /** Save the environment's file without the entry. Answers whether it worked. */
  saveFile: (next: ComposeDocument) => Promise<boolean>
  /** Create the panel hosting for a hostname no deploy has made yet. Answers whether it worked. */
  createPanelHosting: () => Promise<boolean>
}>

/**
 * Manage on this screen instead, in the one safe order.
 *
 * A hosting the last deploy made is released **before** the file loses its
 * entry: if the file save then fails, the row is a panel row the file still
 * names, which the next deploy adopts again. The other order would leave a
 * compose-made row with no entry, which the next deploy deletes along with its
 * certificate pin. With nothing deployed yet the panel hosting is created
 * first (no row holds the name, so it cannot clash) and the entry dropped
 * after: a failed create leaves the file as it was, and a failed drop leaves a
 * panel row the next deploy adopts. Either way nothing typed is lost.
 */
export async function moveComposeHostnameToPanel(
  input: Readonly<{ hostingId: string | null; next: ComposeDocument }>,
  steps: MoveToPanelSteps
): Promise<'released' | 'created' | 'stopped'> {
  if (input.hostingId) {
    if (!(await steps.release(input.hostingId))) return 'stopped'
    return (await steps.saveFile(input.next)) ? 'released' : 'stopped'
  }
  if (!(await steps.createPanelHosting())) return 'stopped'
  return (await steps.saveFile(input.next)) ? 'created' : 'stopped'
}

type HostingRowShape = Readonly<{ metadata?: unknown; options?: unknown }>

function rowRouteKeys(options: unknown): string[] {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return []
  const record = options as { hostnames?: unknown; pathPrefix?: unknown }
  const pathPrefix = typeof record.pathPrefix === 'string' ? record.pathPrefix : undefined
  const hostnames = Array.isArray(record.hostnames) ? record.hostnames : []
  return hostnames
    .filter((name): name is string => typeof name === 'string')
    .map((hostname) => hostingEntryKey({ hostname: hostname.toLowerCase(), pathPrefix }))
}

/**
 * Panel hostings on a service that also has configured hostnames, which the
 * screen lists next to them: a hostname moved out of the file lands here while
 * the service's other entries stay in it. A row serving a route the file
 * declares is left out, because the next deploy takes it over and the
 * configured entry already shows it.
 */
export function panelRowsBesideDeclarations<T extends HostingRowShape>(
  rows: readonly T[],
  entries: readonly ComposeHostingExtensionEntry[]
): T[] {
  const declared = new Set(entries.map((entry) => hostingEntryKey(entry)))
  return rows.filter(
    (row) =>
      !isComposeOwnedHosting(row.metadata) &&
      !rowRouteKeys(row.options).some((key) => declared.has(key))
  )
}

/**
 * The panel hosting that already serves a configured route, the one the next
 * deploy would adopt: a move that released the row (or created it) but could
 * not drop the entry leaves it like this.
 */
export function findPanelRowForRoute<T extends HostingRowShape>(
  rows: readonly T[],
  route: string
): T | undefined {
  return rows.find(
    (row) => !isComposeOwnedHosting(row.metadata) && rowRouteKeys(row.options).includes(route)
  )
}

/**
 * Where a configured route's hosting stands: the row the last deploy made
 * from the file (taken over from the panel or not), a panel row already
 * serving the route, or none yet.
 */
export function configuredHostingState(
  composeOwnedRow: HostingRowShape | undefined,
  panelRow: HostingRowShape | undefined
): ConfiguredHostingState {
  if (composeOwnedRow) {
    return isAdoptedComposeHosting(composeOwnedRow.metadata) ? 'adopted' : 'deployed'
  }
  return panelRow ? 'held-by-panel' : 'not-deployed'
}

export type DeclaredServiceHosting = Readonly<{
  composeServiceName: string
  entries: readonly ComposeHostingExtensionEntry[]
}>

/** Every service in `document` that sets hostnames, with its entries, in file order. */
export function declaredHostingByService(document: ComposeDocument): DeclaredServiceHosting[] {
  const services = document.data.services
  if (!services || typeof services !== 'object' || Array.isArray(services)) return []
  return Object.keys(services)
    .map((composeServiceName) => ({
      composeServiceName,
      entries: readComposeHostingEntries(document, composeServiceName),
    }))
    .filter((service) => service.entries.length > 0)
}
