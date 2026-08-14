# Page Override: Network

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/network` and its sub-routes.

**Routes:**
- Sites (area root) → `network-sites-section.tsx` at `/network`
- Site detail → `network-site-detail-section.tsx` at `/network/sites/:datacenterId`
- TurboFabric → `network-fabric-section.tsx` at `/network/fabric`
- Addresses → `network-addresses-section.tsx`
- Docker networks → `network-docker-section.tsx`

**Job:** Operator topology for private connectivity — site → private CIDR → member servers → addresses → TurboFabric. Docker networks are a quiet deploy registry, not topology.

---

## Hierarchy (spine)

1. **Sites** — physical/logical locations that group servers on a private network
2. **Private CIDR** — `kind: 'datacenter'` networks; prerequisite for replicas and mesh gateway site routes
3. **Member servers** — assignment + each host’s private (`scope: 'datacenter'`) address
4. **Addresses** — org free-pool / public / datacenter-scoped rows
5. **TurboFabric** — org-level opt-in mesh (enable + relay table + Apply)

Sites is the **area root** (not a sub-route). TurboFabric, Addresses, and Docker networks sit in the sidebar as quiet sub-routes.

## Sites list

- One job: **site cards** (`orgPanelStyles.detailCard`), not a dashboard of widgets
- Title **Network** + one line of model copy (sites group servers; TurboFabric connects sites)
- Card shows name, description, member-server count (from one `useOrgServers` group-by — **never** one query per site), private CIDRs monospace from `datacenter.privateCidrs`
- **Missing CIDR is the headline:** inline `calloutWarning` + **Add private network** (creates `kind: 'datacenter'` scoped to the site). Consequence in one line: site can’t host database replicas without a private network
- Secondary gap, quieter: “N servers here have no private address”
- Mesh strip per card from `resolveSiteLinks` / `meshLabelForSite` over one **manage-gated** `useOrgFabric` (`relays[]`) — never a per-relay fan-out. Non-managers see permission-aware copy, never “no relays” from an empty 403 fallback
- Unassigned servers group at the bottom when any server has `datacenterId === null`
- Cold org (zero sites): lead with `FirstRunWizard` instead of an empty table
- Geo/ASN name suggestions on create (`fetchDatacenterNameSuggestions`, `sourceServerId` / `assignServerIds`) when not cold-wizard-only
- Delete confirm: servers and IPs are unpinned, not destroyed; **409** `datacenter_has_networks` copy when networks remain

## Site detail (panel order)

1. **Private network** — CIDR editor first; same actionable empty callout as the card
2. **Member servers** — assign/unassign + private address inline (or muted “No private address”)
3. **TurboFabric** — relays at this site (role, tp0, other sites, **Primary** badge); empty: no relays at this site (**manage-gated** — non-managers get permission copy, not the empty state); `gateway_datacenter_cidr_required` pre-flight via `calloutWarning`; rows deep-link to `/network/fabric`
4. **IP pool** — site-scoped free-pool rows
5. **Timezone** — unchanged picker + enforce toggle

## Addresses

- Scopes: `public | datacenter` (no `loopback`, no `vpn`)
- Scope / allocation filters use `segmentGroup` / `segmentChip`; site filter remains chips
- **409** `ip_in_use` copy retained

## TurboFabric

- Org **opt-in** mesh (`GET`/`PUT /organizations/:id/fabric`). Default **off**. Never auto-enable.
- Copy: enabling TurboFabric lets environments run across servers; it is **not** required for single-engine Docker.
- Product name from `TURBOFABRIC_PRODUCT_NAME`. Never “tp0 fabric”, “which WireGuard network should this container join?”, or “the WireGuard mesh” in UI copy.
- 404/503: muted “not available on this control plane yet” — do not treat as a form error.
- Manage-gated enable toggle (`organization:manage` display hint). Status + CIDR when the API returns `fabric`.
- **Relay table** — one row per org server: tp0 address, role chip (gateway/member) with inline promote/demote (`PATCH /organizations/:id/fabric/relays/:serverId`), advertised LAN CIDRs (editable, gateway-only), **endpoint override** (operator pin) separate from **resolved endpoint**, `calloutWarning` when auto-derivation failed (`endpointAddress` and `resolvedEndpoint` both null), host **segments** (`name` + `subnet`), keepalive, public-key-present boolean (`publicKey !== null`), preshared-key presence (`hasPresharedKey`, never the key), last handshake with staleness (`calloutWarning` when null or older than the threshold).
- Preshared key is **write-only**: optional “Set preshared key” input, empty by default, submitted only when typed — never populate from `RelayRecord`.
- **Apply** (`POST /organizations/:id/fabric/apply`) feeds returned `{serverId, commandId}` pairs into `useCommandsBatch` / `COMMAND_POLL_MS`. Disable Apply while the POST is pending **or** any tracked command is non-terminal; merge later queued ids into the polling set. In-flight rows show pending until terminal. No DO polling.

## Docker networks

- Only `kind: 'docker'`; no kind picker
- Fields: display name, Docker network name, optional host pin (`serverId`)
- Copy: compose must use the same name under `networks.*.name`
- Deliberately last in the sub-nav — registry, not topology

## Server detail Network tab

Display-only: site name links to site detail; mesh membership via `networkFabricHref` (**manage-gated** `useOrgFabric` — permission copy when the viewer cannot manage). No duplicate assignment UI.

## Anti-patterns

- ❌ N+1 server/IP fetches per site card
- ❌ Unbounded per-server queries for mesh membership
- ❌ Rendering `presharedKey` on relays
- ❌ DO polling for Apply status — use `useCommandsBatch`
- ❌ Duplicate datacenter-assignment controls on the server Network tab
- ❌ Late CIDR validation only — gaps are first-class on site cards

## Tokens

Use `src/lib/theme.ts` + `org-panel-styles.ts` only (`pageTitle`, `pageCopy`, `detailCard`, `detailTitle`, `detailLine`, `statePanel`, `calloutWarning`, `segmentGroup`/`segmentChip`, `toolbarBtn*`, `webPointer`).
