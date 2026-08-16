# Page Override: Network

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/network` and its sub-routes.

**Routes:**
- Hub (area root) → `network-overview-section.tsx` at `/network`
- TurboFabric → `network-fabric-section.tsx` at `/network/fabric`
- Addresses → `network-addresses-section.tsx`
- Docker networks → `network-docker-section.tsx`

**Job:** Mesh, address pool, and Docker registry. **Private CIDRs are Datacenters** (`/servers/datacenters`) — do not duplicate that CRUD here.

---

## Hub

- Title **Network** + one line: private CIDRs live on Datacenters; this area is mesh / addresses / Docker
- Four `detailCard` links (Datacenters, TurboFabric, Addresses, Docker networks) — not a second sites inventory
- Legacy `/network/sites/:id` redirects to `/servers/datacenters/:id`

## Addresses

- Scopes: `public | datacenter` (no `loopback`, no `vpn`)
- Identity is the address — optional **Description** (`varchar(255)`), never a display name
- Scope / allocation filters use `segmentGroup` / `segmentChip`
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

Display-only: each membership links to datacenter detail; mesh membership via `networkFabricHref` (**manage-gated** `useOrgFabric` — permission copy when the viewer cannot manage). No duplicate assignment UI.

## Anti-patterns

- ❌ A second Sites inventory or CIDR editor on `/network`
- ❌ N+1 server/IP fetches per card
- ❌ Unbounded per-server queries for mesh membership
- ❌ Rendering `presharedKey` on relays
- ❌ DO polling for Apply status — use `useCommandsBatch`
- ❌ Duplicate datacenter-assignment controls on the server Network tab
