# Page Override: Managed Services

> Overrides `design-system/turbopanel/MASTER.md` for managed engine projects.

**Routes:**
- `/[orgId]/managed` — org-wide managed services overview (`managed-overview-section.tsx`)
- `/[orgId]/projects/new` — empty project create (then setup → managed catalog)
- `/[orgId]/projects/[projectId]/{overview,connect,data,backups,environments}` — managed tab shell when `metadata.type === 'managed'`

**Job:** Operate managed database clusters (primary + replicas), connect services via bindings, manage users/databases and backups — without per-row polling or DO reads.

---

## Org overview (`/[orgId]/managed`)

Dense ops table backed by a **single** `GET /organizations/:id/managed` call (`fetchOrganizationManaged`). No per-row status polling and no Durable Object reads.

| Column | Notes |
|--------|--------|
| Engine | Catalog badge (`PostgreSQL`, …) |
| Name | Managed display name (fallback project / engine) |
| Project | `project / environment` |
| Server | Host display name (primary pin) |
| Status | Pill via `managedStatusLabel` + status dot |
| Topology | `Primary` / `Primary + N replica(s)` + warning dot when any member status is unhealthy |
| Shared listener | ProxySQL `host:port`, or **Not exposed** |

- **Row press** → `/[orgId]/projects/[projectId]`
- **Filters** (client-side): engine, status, server
- **+ Managed service** → create flow
- **Refresh:** one restrained interval on the org list only

Visual: reuse `orgPanelStyles` + servers overview table / zebra / status-dot patterns.

---

## Create flow (four questions)

Wizard progress: **Type → Engine → Details → Server** (+ show-once secret outside the rail).

1. **Type** — Managed  
2. **Engine** — catalog cards; only `available` is pressable  
3. **Details** — name (+ workspace when ambiguous)  
4. **Server** — connected servers selectable; offline rows disabled with Offline hint  

Submit: `POST /projects` (`type: 'managed'`) → Production env → `POST …/managed` → **SecretReveal**. Exposure / published ports are **not** collected here (shared ProxySQL listener model).

### Show-once secret pattern

- Shared `SecretReveal` (`calloutWarning` + `commandCodeBlock` + Copy)
- Clear plaintext on dismiss / unmount
- Same component for create, root rotation, and user create / rotate

---

## Managed project tabs

| Tab | Panels |
|-----|--------|
| **Overview** | **Cluster** (topology, add replica, promote) · Lifecycle · Settings · Status |
| **Connect** | **Connection** (endpoints + CA) · **Connected services** (bindings) |
| **Data** | Credentials · Users & databases |
| **Backups** | metadata-only backups (typed restore) |
| **Environments** | environment switcher + lifecycle when focused |

### Cluster (Overview)

Topology rows ordered primary first then `ordinal`:

```
● Primary   web-01 · Frankfurt · Same server        Running
● Replica   web-04 · Frankfurt · Same site   Reads  Streaming · 1.4 MB behind
○ Replica   edge-02 · Ashburn  · TurboFabric        Catching up · 22s behind
```

- Transport vocabulary: **Same server** / **Same site** / **TurboFabric**
- Max **2 replicas** (`MANAGED_MAX_REPLICAS`)
- **Ineligible servers always say *why*** (`already-member` / `offline` / `no-datacenter` / `no-private-cidr`) with **Set up private network** links for network reasons — never silent disable
- **Reads** chip toggles `readEligible` (manage-gated)
- Remove replica = two-press (destroys replica data volume)
- **Promote** = typed confirmation (managed/project display name); writes pause during switch. On lag-gate `409` codes, show lag/state then separate **Promote anyway** (`force: true`). On `managed_primary_fence_failed`, surface fence failure — do not auto-retry.

### Connection (Connect)

- **Write endpoint** = shared ProxySQL `host:port` (protocol port 5432 / 3306 stated plainly)
- **Login** = routing username (“the username is how the proxy routes you to this cluster”)
- **Read endpoint** only when any member is `readEligible` — same host/port
- TLS: `sslmode=verify-full` required + **Download CA certificate** (never private key)
- Masked DSN + Copy; pointer to **Connect to a service**

### Bindings (Connect · Connected services)

Four-question inline form: **Environment → Service → User + Database → Key prefix**  
- Live prefix validation + `previewBindingKeys` + **Also set engine defaults**  
- List groups by service; show locked monospace key chips from server `keys[]`  
- **Password is never shown** — credential is delivered on deploy  
- Disconnect = two-press  
- Map binding error codes via `managedErrorMessage`

### Users / databases (Data)

- Org-wide username uniqueness: quiet line above the form; on `username_in_use` show rename prompt (suggested suffix), not a raw dump  
- **Connected to N services** chip from environment bindings; disable delete when count > 0  
- Rotate user / root password → show-once + redeploy list (`redeployRequired.services`) with per-service **Redeploy** (enqueue deploy; never silent restart)

### Restore confirmation copy rule

Destructive restore still requires typing the managed/project display name and naming the database.

### O(1) read rule

- **Members** ride `useEnvironmentManaged` (`detail.members`) + `useManagedStatus` (`status.members`); prefer status for health/lag; **no members timer**
- Status poll only while `provisioning` / `applying`
- Logs never on a timer
- **One** `COMMAND_POLL_MS` batch for every command-producing mutation
- Bindings + org CA never poll

---

## Anti-patterns

- ❌ Per-member timer or N+1 status reads  
- ❌ Per-binding project fetch fan-out  
- ❌ Showing a binding password or the CA private key  
- ❌ Editable binding-owned variables  
- ❌ Silently disabled server rows in the replica picker  
- ❌ Auto-restart after password rotation  

## Tokens

`theme.ts` + `org-panel-styles.ts` only (`detailCard`, `detailTitle`, `detailLine`, `calloutWarning`, `commandCodeBlock`, `segmentGroup`/`segmentChip`, `statePanel`, `toolbarBtn*`, `webPointer`).
