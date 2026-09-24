# Page Override: Updates

> Overrides `design-system/turbopanel/MASTER.md` for `/admin/updates`.

**Route:** `/admin/updates` → `updates-section.tsx` (self-hosted: `self-hosted-updates.tsx`; High Availability: `ha-updates.tsx`).

**Job:** One managed upgrade experience — status, readable build names, phased progress (co-located daemon → control plane → fleet), fleet table with retry, history, and automatic-update settings on self-hosted. High Availability is read-only for the control plane and hides local Upgrade / auto-update controls.

---

## Layout (tokens + primitives only)

- Tokens from `src/lib/theme.ts`. Primitives from `@/components/ui`: `SectionPanel`, `DataTable`, `Toggle`, `SettingRow`, `SegmentedControl`, `TextField`, `ModalSheet`, `InlineNotice`, `StatusDot`, `Badge`, `CopyButton`, `WizardSteps`.
- Full-screen **TurboPanel is updating** overlay (`control-plane-updating-overlay.tsx`) while the control plane restarts (`control_plane_updating` or an active `control_plane` step). Prompt reload when `x-turbopanel-version` differs from the bundled client.

## Self-hosted

1. **Status card** — headline (`TurboPanel is up to date` / `Update available` / `Updating…` / `Needs attention`) and primary **Update TurboPanel** (opens preflight `ModalSheet`).
2. **Build names** — `Canary · Sep 19, 14:30` with version/commit behind **Details**.
3. **Step indicator** — `WizardSteps`: Preparing → Downloading → Installing → Restarting → Verifying → Done for co-located daemon, then control plane, then fleet summary + paged `DataTable` (status, version, step, error, **Retry**).
4. **Update history** — who started, when, result.
5. **Auto-update card** — toggle, batch percent/count (default 100%), optional maintenance window note.
6. **Preflight dialog** — checklist, backup note, recovery CLI with `CopyButton` before start.

Polling uses `refetchInterval` only while a run is `pending` / `running` (`useUpgradeActiveRun`).

## TurboPanel High Availability

- Control plane: **Managed by TurboPanel** (read-only version).
- Connected daemons `DataTable` with filter chips; rollout summary; history; batch settings **without** auto-update toggle or **Update TurboPanel** button.
- Copy uses `HA_PRODUCT_NAME` from `src/lib/platform-copy.ts`.

## Org console

- `control_plane_upgrade_required` → badge **Waiting for the control plane upgrade** (`daemon-update-labels.ts`).
- `updates_managed` hides per-server **Update** on server detail and fleet batch actions.

## API (admin)

Documented in `src/lib/instance-api.md` — managed endpoints under `/api/admin/v1/instance/updates/*` with legacy `POST …/instance` and `…/daemon` fallback when the orchestrator routes are not deployed yet.
