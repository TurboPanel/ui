# Page Override: Datacenters

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/datacenters` and `/[orgId]/servers/datacenters/:id`.

**Routes:**
- List → `datacenters-overview-section.tsx` at `/servers/datacenters`
- Create → `datacenter-form-section.tsx` at `/servers/datacenters/new`
- Detail → `datacenter-detail-section.tsx` at `/servers/datacenters/:id`
- Legacy `/network/sites/:id` redirects here

**Job:** A datacenter **is** the private network — one CIDR, member servers whose reported IPs fall in that range. Not a second CRUD surface under Network.

---

## Layout (list)

- One job: **dense table**, not site cards or a dashboard of widgets
- Row press navigates to `/[orgId]/servers/datacenters/[datacenterId]`
- Page title **Datacenters** + one line of copy via `orgPanelStyles.pageTitle` / `pageCopy`
- **+ Datacenter** (manage-gated) in the table toolbar; disabled unless ≥1 server reports a private IP; navigates to `/servers/datacenters/new`
- Empty list: table panel with **+ Datacenter** and `statePanel` — **do not** auto-open the create form
- Empty org with no reported private IPs: same empty list plus the eligibility hint (wait for daemon addresses / add a server first)
- No hero, no decorative bento above the table

## Density

- Table-first: Datacenter | Country | Servers | Private CIDRs | Timezone
- Web row hover (`bgSecondary`) and zebra (`bgInset`)
- Description as muted subtext under the name when present
- Country: flag emoji + English name from `metadata.geo` (or em dash) — same cue as the fleet table
- CIDRs and timezone are monospace; missing values are an em dash, never `0`
- Server counts come from one `useOrgServers` group-by over `server.datacenters[]` — a server in N DCs counts in each — **never** one query per datacenter

## Create

- Route: `/[orgId]/servers/datacenters/new` → `datacenter-form-section.tsx` (same labeled-field `SectionPanel` pattern as workspace new/edit)
- Requires `organization:manage` (display hint; server 403 is authoritative)
- Requires ≥1 server with a daemon-reported private IP
- Fields start empty — do not pre-fill name suggestions or expand seed chips
- Flow: optional display name / description → pick a **server** → pick a **reported private IP** (chips only — never a text field) → show the **CIDR read-only** (daemon-reported prefix when present, otherwise a typical LAN `/24` or `/64`)
- Create stays disabled until a server and a reported private IP are selected
- After create, navigate to datacenter detail so more hosts can be pinned
- Cancel returns to the list
- Body: `{ displayName?, description?, members: [{ serverId, address }], sourceServerId? }` — **no operator `cidr`**. Instance derives the site network from the seed member’s reported prefix when present, otherwise a typical LAN (`/24` IPv4, `/64` IPv6)
- Optional geo name suggestions only fill the display name when chosen
- A server may belong to multiple datacenters (different NICs / ranges)
- Empty create is rejected (API and UI)

## Detail (panel order)

1. **Datacenter** — display name + description (manage-gated save; same fields as create)
2. **Private network** — read-only detected CIDR; never an editor
3. **Member servers** — pin/unpin via `addDatacenterMembers` / `removeDatacenterMember` (select a server that reports a private IP **inside the datacenter CIDR**, then pick that IP from chips). Unassign all members before delete is allowed
4. **TurboFabric** — relays in this datacenter (role, tp0, other datacenters, **Primary** badge); empty: no relays here (**manage-gated** — non-managers get permission copy, not the empty state); rows deep-link to `/network/fabric`
5. **Timezone** — picker + enforce toggle
6. **Delete** — two-press confirm when member count is 0; disabled with copy while any server is pinned. **409** `datacenter_has_members` copy if the API still sees pins

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads
- ❌ N+1 server or IP fetches per row
- ❌ Recreating Network site cards, CIDR editors, IP pool, or “Add private network”
- ❌ Allowing create with no member pins or typed CIDR / typed IP
- ❌ Status conveyed by color alone
- ❌ Using singular `server.datacenterId` / `assignServerIds` (retired)

## Tokens

Use `src/lib/theme.ts` + `org-panel-styles.ts` only (`pageTitle`, `pageCopy`, `statePanel`, `muted`, `error`, `webPointer`).
