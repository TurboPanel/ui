# Page Override: Network

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/network` and its sub-routes.

**Routes:**
- Hub (area root) → `network-overview-section.tsx` at `/network`
- TurboFabric → `network-fabric-section.tsx` at `/network/fabric`
- Addresses → `network-addresses-section.tsx` at `/network/addresses`
- Docker networks → `network-docker-section.tsx` at `/network/docker`
- Reserved ranges → `network-reserved-section.tsx` at `/network/reserved`

**Job:** Mesh, address pool, Docker registry + host addressing, and reserved ranges. **Private subnets live on Datacenters** (`/servers/datacenters`) — a datacenter is a logical routing domain, not a building, and a server may belong to several — do not duplicate that CRUD here.

---

## Hub

- Title **Network** + one line: private subnets live on Datacenters; this area is mesh / addresses / Docker / reserved ranges
- Five `detailCard` links (Datacenters, TurboFabric, Addresses, Docker networks, Reserved ranges) — not a second sites inventory
- Legacy `/network/sites/:id` redirects to `/servers/datacenters/:id`

## Error copy (shared)

Every network surface maps instance codes through **`src/lib/network-error-copy.ts`** (`describeNetworkError` / `networkErrorMessage`) and renders with `NetworkErrorLine` — the same **409** never reads two ways. `createNetwork` / `updateNetwork` / `createDatacenterSubnet` / `updateOrganizationDockerNetworking` throw a typed `CidrCollisionError` on a collision **409**; its `conflictingCidr` follows the sentence in `MonoText`.

| Code | Copy |
| --- | --- |
| `cidr_overlaps_fabric` | That range overlaps the TurboFabric range (tp0) for this organization. |
| `cidr_overlaps_fabric_pool` | That range overlaps the TurboFabric container pool. |
| `cidr_overlaps_reserved` | That range overlaps a reserved range — something outside TurboPanel routes it. |
| `cidr_overlaps_docker_network` | That range overlaps a registered Docker network or a Docker address pool. |
| `cidr_overlaps_gateway_advertised` | A gateway in another datacenter already advertises that range across the mesh. |
| `subnet_overlaps` | That range overlaps an existing subnet in this organization. (unchanged) |
| `failover_requires_trusted_datacenter` | `FAILOVER_REQUIRES_TRUSTED_DATACENTER_COPY` from `managed-services.ts` — never forked |
| `network_cidr_required`, `docker_network_*`, `address_pool*`, `default_bridge_cidr_invalid` | Field-level sentences (see the module) |

Product name from `TURBOFABRIC_PRODUCT_NAME` — never “tp0 fabric” or “the WireGuard mesh”.

## Addresses

- Scopes: `public | datacenter` (no `loopback`, no `vpn`)
- Identity is the address — optional **Description** (`varchar(255)`), never a display name
- Scope / allocation filters use `segmentGroup` / `segmentChip`
- Datacenter **free pool**: datacenter only (no host, no site subnet). **Membership pin**: host + required site subnet of that datacenter (`networkId`). Never POST/PATCH a pin without `networkId`.
- **409** `ip_in_use` copy retained

## TurboFabric

- Org **opt-in** mesh (`GET`/`PUT /organizations/:id/fabric`). Default **off**. Never auto-enable.
- Copy: enabling TurboFabric lets environments run across servers; it is **not** required for single-engine Docker.
- Product name from `TURBOFABRIC_PRODUCT_NAME`. Never “tp0 fabric”, “which WireGuard network should this container join?”, or “the WireGuard mesh” in UI copy.
- 404/503: muted “not available on this control plane yet” — do not treat as a form error.
- Manage-gated enable toggle (`organization:manage` display hint). Status + CIDR when the API returns `fabric`.
- **Relay table** — one row per org server: tp0 address, role chip (gateway/member) with inline promote/demote (`PATCH /organizations/:id/fabric/relays/:serverId`), advertised LAN CIDRs (editable override, gateway-only) separate from **resolved advertised CIDRs** (`resolvedAdvertisedCidrs` — effective IPv4 list when the override is empty), **endpoint override** (operator pin) separate from **resolved endpoint**, `calloutWarning` when auto-derivation failed (`endpointAddress` and `resolvedEndpoint` both null), host **segments** (`name` + `subnet`), keepalive, **allow relay** inherit/on/off chips plus read-only **Effective: On/Off**, **preferred gateways** chips restricted to `gatewayEligible` relays, public-key-present boolean (`publicKey !== null`), preshared-key presence (`hasPresharedKey`, never the key), last handshake with staleness (`calloutWarning` when null or older than the threshold).
- Org **Allow relay path** toggle sits next to enable (manage-gated). Copy: relay is a degraded fallback and must be explicitly enabled; a datacenter gateway is not the same as an unrelated relay.
- **Path matrix** (`FabricPathMatrixPanel`) below Relays — one `detailCard` per `buildFabricPathMatrix` row (`Server A → Server B`, path kind, latency, optional via, `calloutWarning` for DEGRADED / Unreachable). No new colors. Reuse Apply / `useCommandsBatch` — no extra polling.
- Preshared key is **write-only**: optional “Set preshared key” input, empty by default, submitted only when typed — never populate from `RelayRecord`.
- **Apply** (`POST /organizations/:id/fabric/apply`) feeds returned `{serverId, commandId}` pairs into `useCommandsBatch` / `COMMAND_POLL_MS`. Disable Apply while the POST is pending **or** any tracked command is non-terminal; merge later queued ids into the polling set. In-flight rows show pending until terminal. No DO polling.

## Docker networks

- Only `kind: 'docker'`; no kind picker
- **Host address pools** `SectionPanel` (manage-gated, collapsible, above the register form) — `useOrgDockerNetworking` / `useSaveOrgDockerNetworking` over `GET`/`PUT /organizations/:id/docker-networking`:
  - Editable `{ base, size }` rows (≤ `DOCKER_ADDRESS_POOLS_MAX` = 16): `base` is the pool CIDR, `size` the prefix length each auto-created network is carved at (≥ base prefix, ≤ `/30` IPv4 / `/126` IPv6). Pre-validate with `parseDockerAddressPoolDrafts` (base, size, pairwise overlap) and place the error on the offending row.
  - Optional **Default bridge** (`defaultBridgeCidr`, dockerd `bip`) — copy says it is the bridge's own **host address with prefix** (`172.17.0.1/16`), not a network address; `isValidDefaultBridgeCidr` rejects the network address client-side.
  - Empty pools + null bridge = Docker's built-in defaults — say so in a muted line rather than rendering blank fields.
  - A failed `GET` (anything but the 403 the hook folds into defaults) is **not** an empty configuration: render it through `NetworkErrorLine` with a **Retry** button and keep every field and Save disabled until the read succeeds — `PUT` is replace-all, so saving over an unloaded config would wipe it.
  - Persistent `InlineNotice` (`warning`): saving changes `/etc/docker/daemon.json` on every enrolled host and **restarts dockerd**; existing networks and containers keep their addresses — pools only affect networks created afterwards.
  - `PUT` is replace-all; 409s through the shared copy module.
- **Register** fields: display name, Docker network name, optional host pin (`serverId`), plus optional **Subnet**, **IP range**, **Gateway**, **MTU**. Encode the API's dependencies in the form: IP range and gateway are disabled until a subnet is typed and must sit inside it; MTU is 1280–9000; addressing goes under `options` only — never a top-level `cidr` beside `options.subnet` (a disagreeing pair is **400** `docker_network_subnet_mismatch`). Pre-validate with `parseDockerNetworkAddressingDraft`; errors adjacent to the field.
- Copy: compose must use the same name under `networks.*.name`; addressing applies when the daemon first creates the network — Docker cannot re-range an existing network.
- `NetworkListItem` shows Subnet / IP range / Gateway / MTU as monospace detail lines with the re-range note.
- Registry, not topology — sits after Addresses in the sub-nav

## Reserved ranges

- Route `/network/reserved` → `network-reserved-section.tsx`; `kind: 'reserved'` rows only, **no** `datacenterId` / `serverId`
- Copy explains *why*: ranges TurboPanel must never assign to containers, the mesh, or internal services because something outside TurboPanel already routes them (a corporate VPN, a remote branch, an upstream allocation); the consequence is that those addresses keep reaching Caddy and published services without colliding with a TurboPanel-assigned address. The mesh and Docker pool allocators avoid them too.
- Manage-gated add form: `name` + `cidr` over `useCreateNetwork`. Pre-validate with `isValidCidr` / `normalizeCidr` and echo the aligned form as the field hint (same pattern as Add subnet)
- List over `useNetworks(orgId, { kind: 'reserved' })`: mono CIDR + **Reserved** `Badge`, inline rename (`useUpdateNetwork`, `name` only — never send `cidr: null`, that is **400** `network_cidr_required`), two-press delete (`ConfirmButton`) whose prompt says TurboPanel may then assign addresses inside it
- 409s through the shared copy module

## Server detail Network tab

Display-only. One `InlineNotice` (`info`) at the top: **TurboPanel observes host interfaces, it does not configure them** — addresses are expected to change; pins follow the host automatically when exactly one unambiguous replacement is reported, otherwise they go stale rather than guess. No affordance on this tab may imply TurboPanel can bring an interface up, assign an address, or write a route.

- **Interfaces** is the centre: `groupReportedAddresses` groups the daemon's `ips[]` by `interface` (default-route interface first; fallback to public/private × v4/v6 when no interface name is reported); each address shows its reported CIDR, family badge, scope, the `default route` marker, and **Pinned into: <datacenter>** lines joined on address from the already-fetched `scope: 'datacenter'` rows (`indexPinsByAddress`). No per-interface fetch.
- **Stale** `Badge` (`pending`) on any pin whose `IpRecord.stale` is true, with `staleSince` and `stalePinReasonLabel(staleReason)` (`address_gone_no_candidate` → “no replacement address was reported”; `address_gone_ambiguous` → “more than one candidate address, so nothing was guessed”). Never colour-only.
- Datacenters panel: each membership links to datacenter detail; list **every** `scope: 'datacenter'` pin for this host (IPv4/IPv6 badge + datacenter label + stale note — dual-stack / multi-subnet hosts are not truncated to one address). Mesh membership via `networkFabricHref` (**manage-gated** `useOrgFabric` — permission copy when the viewer cannot manage). No duplicate assignment UI.
- Queries stay `datacenterIpsQuery` + `serverManagedIpsQuery` — nothing new.

## Anti-patterns

- ❌ A second Sites inventory or CIDR editor on `/network`
- ❌ N+1 server/IP fetches per card
- ❌ Unbounded per-server queries for mesh membership
- ❌ Rendering `presharedKey` on relays
- ❌ DO polling for Apply status — use `useCommandsBatch`
- ❌ Duplicate datacenter-assignment controls on the server Network tab
- ❌ Any control on the server Network tab that implies configuring an interface, address, or route
- ❌ Sending top-level `cidr` **and** `options.subnet` on a Docker registration
- ❌ Rendering blank pool fields as if Docker had no defaults
- ❌ A second copy of a collision sentence outside `network-error-copy.ts`
