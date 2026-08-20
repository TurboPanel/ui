# Page Override: Datacenters

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/servers/datacenters` and `/[orgId]/servers/datacenters/:id`.

**Routes:**
- List → `datacenters-overview-section.tsx` at `/servers/datacenters`
- Create → `datacenter-form-section.tsx` at `/servers/datacenters/new`
- Detail → `datacenter-detail-section.tsx` at `/servers/datacenters/:id`
- Legacy `/network/sites/:id` redirects here

**Job:** A datacenter is a **routing domain** — one or more mutually routable private subnets (IPv4 and/or IPv6), plus member pins. Not a second CRUD surface under Network. Subnets are all mutually routable inside the datacenter.

---

## Layout (list)

- One job: **dense table**, not site cards or a dashboard of widgets
- Row press navigates to `/[orgId]/servers/datacenters/[datacenterId]`
- Page title **Datacenters** + a short `pageCopy` line (not a how-to paragraph)
- **+ Datacenter** (manage-gated) in the table toolbar; disabled unless ≥1 server reports a private IP; navigates to `/servers/datacenters/new`
- Empty list: table panel with **+ Datacenter** and `statePanel` — **do not** auto-open the create form
- Empty org with no reported private IPs: same empty list plus the eligibility hint
- No hero, no decorative bento above the table

## Density

- Table-first: Datacenter | Country | Servers | Subnets | Timezone
- Subnets column: `formatDatacenterSubnetSummary(privateCidrs)` — em dash, a single CIDR, or `10.0.0.0/24 +2` when more than one. List payload has `privateCidrs` only — never fetch detail per row
- Web row hover (`bgSecondary`) and zebra (`bgInset`)
- Description as muted subtext under the name when present
- Country: flag emoji + English name from `metadata.geo` (or em dash) — same cue as the fleet table
- CIDRs and timezone are monospace; missing values are an em dash, never `0`
- Server counts come from one `useOrgServers` group-by over `server.datacenters[]` — a server in N DCs counts in each — **never** one query per datacenter

## Create

- Route: `/[orgId]/servers/datacenters/new` → `datacenter-form-section.tsx`
- Compact labeled form (`maxWidth` ~520) — page title only, no how-to copy
- Requires `organization:manage` (display hint; server 403 is authoritative)
- Requires ≥1 server with a daemon-reported private IP
- Fields start empty — do not pre-fill name or auto-select a server
- Flow: optional name / description → **server dropdown** (`FormSelect`) → **private IP dropdown** (never a text field) → read-only **First subnet** (daemon-reported prefix when present, otherwise a typical LAN `/24` or `/64` with a quiet “typical LAN” cue)
- If the chosen server has exactly one private IP, select it automatically
- Geo name suggestions are optional chips under the name field (no helper sentence)
- Create stays disabled until a server and a reported private IP are selected
- After create, navigate to datacenter detail
- Cancel returns to the list
- Body: `{ name?, description?, members: [{ serverId, address }], sourceServerId? }` — **no operator `cidr`**

## Detail (panel order)

1. **Datacenter** — display name + description (manage-gated save)
2. **Subnets** — one `detailCard` per subnet: monospace CIDR (read-only / immutable), `IPv4`/`IPv6` text badge (`segmentChip` style — never colour alone), optional label, `memberCount` (“3 servers”). Empty: `statePanel` “No subnets yet — add one or pin a server whose reported prefix creates it.” Loading: muted “Loading…”.
   - **Add subnet** (manage-gated): CIDR + optional label. Client-validate with `isValidCidr`, echo `normalizeCidr`, pre-check overlap with `cidrsOverlap`. **400** `invalid_cidr` → “Enter a valid IPv4 or IPv6 CIDR.” **409** `subnet_overlaps` → “That range overlaps an existing subnet in this organization.”
   - **Rename** (`name`) via `PATCH …/subnets/:networkId` — never send `cidr`
   - **Delete subnet**: two-press confirm; disabled while `memberCount > 0` (“Unassign the pinned servers first.”); **409** `subnet_has_members` uses the same copy
3. **Routing / address preference** — `segmentGroup` **Prefer IPv6** / **Prefer IPv4** (default IPv6 when `options.addressPreference` is absent). One muted note: “Only applies when both servers have an address in the same datacenter in both families.” Save via `PATCH /datacenters/:id` with `mergeDatacenterOptions` so timezone is not clobbered
4. **Member servers** — rows from detail `members[]` joined to `useOrgServers` (a server may appear multiple times). Each pin: selectable monospace address, IPv4/IPv6 badge, owning subnet CIDR (`networkId`, fallback `subnetForAddress`). Hint `{pins} pins · {servers} servers`. Picker: `listServersWithCandidateAddresses` / `candidateMemberNetworks` — both families, no CIDR gate, `FormSelect` only. Quiet note when the chosen address matches no subnet: “Adds a new subnet {cidr} to this datacenter.” Unassign removes **all** pins for that server in this datacenter (announce when the server holds more than one). **409** `address_in_use` → “That address is already pinned.”
5. **TurboFabric** — relays in this datacenter (role, tp0, other datacenters, **Primary** badge, **Via** when a `gateway`-kind path is selected); empty: no relays here (**manage-gated**); rows deep-link to `/network/fabric`. Missing-subnet warning when the datacenter has no subnets
6. **Timezone** — picker + enforce toggle; save through `mergeDatacenterOptions` so address preference survives
7. **SSH port** — optional override (empty inherits org, then 22); save through `mergeDatacenterOptions`. Desired config only — does not rewrite sshd
8. **NTP defaults** — enabled + servers + fallback; empty+off inherits org; **Clear (inherit)** sends `ntp: null`. Apply still happens on each server Time tab
9. **Delete** — two-press confirm when pin count (`members.length`) is 0; disabled while any pin remains

Keep labels and empty states short. Do not add how-it-works paragraphs on these panels.

## Anti-patterns (page-specific)

- ❌ Calling `fetchServerCell` / DO reads
- ❌ N+1 server or IP fetches per row
- ❌ Per-subnet detail fetches on the list
- ❌ Editing a subnet’s CIDR in place (CIDR is immutable)
- ❌ Colour-only family cues (always pair IPv4/IPv6 with a text label)
- ❌ Recreating Network site cards, CIDR editors, IP pool, or “Add private network”
- ❌ Allowing create with no member pins or typed CIDR / typed IP
- ❌ Server/IP selection as chip buttons (use `FormSelect`)
- ❌ Status conveyed by color alone
- ❌ Using singular `server.datacenterId` / `assignServerIds` (retired)
- ❌ Saving timezone, address preference, SSH port, or NTP without merging `options` (`PATCH` replaces the blob)

## Tokens

Use `src/lib/theme.ts` + `org-panel-styles.ts` only (`pageTitle`, `pageCopy`, `detailCard`, `detailLine`, `detailLabel`, `statePanel`, `calloutWarning`, `segmentGroup` / `segmentChip`, `toolbarBtn*`, `muted`, `error`, `webPointer`).
