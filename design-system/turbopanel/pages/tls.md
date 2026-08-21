# Page Override: TLS / Organization CA

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/tls`.

**Route:** `src/app/[orgId]/servers/tls` → `tls-overview-section.tsx`  
**Job:** Organization CA lifecycle (inspect, download bundle, rotate, retire) plus the uploaded / self-signed / Let's Encrypt certificate library.

---

## Layout

- Two stacked jobs on one route: **Organization CA** first, then the **TLS certificates** library (and **Add certificate** for managers)
- `OrganizationCaPanel` is the first child inside `styles.root`, above the existing “TLS certificates” `SectionPanel`
- The library panel and “Add certificate” stay unchanged — they remain the uploaded / self-signed / Let's Encrypt store; the Organization CA row is platform-managed and is not created from Add certificate
- Organization CA `SectionPanel` hint covers managed-database / SQL-client trust only — hosting certificate issuance stays on the library panel below
- Page title / route context lives in `OrgHeader` eyebrow; this surface has no extra page title
- No hero, no decorative bento, no KPI strip
- Tokens only from `src/lib/theme.ts` (`colors`, `spacing`, `chrome`) via `orgPanelStyles` — no one-off hex

## Toolbar

- Organization CA actions sit in a wrapping row under the active-CA `detailCard`
- **Download CA bundle** — `orgPanelStyles.toolbarBtnSecondary` (same clipboard + anchor download as Managed Connect)
- **Rotate** — `orgPanelStyles.toolbarBtnSecondary` with destructive styling (`colors.error` border, `colors.errorText` label). Disabled while tracked commands are in flight or rotate/retire is pending. Pressing it **reveals** an `expandedSection` typed-confirmation block; it does not rotate immediately
- **Retire previous CA** — secondary toolbar button, shown only when the rotation journal is `awaiting_retire`. Enabled only when tracked commands are idle and every visible result is terminal-success. When shown but not yet enabled, muted copy next to the button uses the same mapping as the 409 (`Some servers haven't converged yet`) — never a silent disabled control
- No horizontal rules under the toolbar

## Components

- Reuse `orgPanelStyles` `detailCard`, `calloutWarning`, `expandedSection`, `toolbarBtnSecondary`
- Active CA card: validity window (`notBefore` → `notAfter`) only — no common name, fingerprint, or generation
- Warning callout when the CA is near expiry, a rotation is in progress (`state !== 'completed'`), or `leafHealth.dueCount > 0`
- Typed confirmation matches `ConfirmStepSection` in `project-delete-panel.tsx`: operator types the organization display name; copy states that `verify-ca` / `verify-full` clients must pick up the new bundle and binding-consuming services need a redeploy
- Rotation progress table reuses the Fabric pattern (`useCommandsBatch` + `mergeTrackedCommandEntries` + `hasPendingTrackedCommands`): one `detailCard` row per result (server label, optional `kind` / `managedId` badge, live command status falling back to the journal, error text). Hidden when the journal is missing or `completed`; local `tracked` / `resultsById` reset then so retirement does not leave stale rows
- Managed Connect (`managed-connection-panel.tsx`) shows a small warning line under **Download Organization CA** when the trust bundle still contains more than one root: “A previous Organization CA generation is still trusted during rotation — download the latest bundle to pick up the new root.”

## Anti-patterns (page-specific)

- ❌ Polling `GET /tls/ca/rotation` on an interval (live progress is `useCommandsBatch` only)
- ❌ Rotating without typed confirmation of the organization display name
- ❌ Primary/accent styling on Rotate (it is destructive)
- ❌ Inventing a second progress-row chrome instead of the Fabric `detailCard` + status/error pattern
- ❌ Retire enabled while commands are in flight or any visible result is not terminal-success
- ❌ Showing private-key material or treating Organization CA as an Add-certificate source
- ❌ Copy that says hosting leaves are issued from the Organization CA
- ❌ Rotation progress that stays visible after retirement because local tracked rows were never cleared
- ❌ Overlap notice on Managed Connect that uses color alone without the explicit “previous generation still trusted” copy
- ❌ Raw hex in this panel when a `theme.ts` token exists
