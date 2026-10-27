# Page Override: Updates

> Overrides `design-system/turbopanel/MASTER.md` for `/admin/updates`.

**Route:** `/admin/updates` → `updates-section.tsx` (self-hosted: `self-hosted-updates.tsx`; High Availability: `ha-updates.tsx`).

**Job:** Show where automatic updates stand. Updates of the control plane, the web interface and every daemon start on their own (hourly check, daemons in groups, failed servers retried with backoff). Nobody starts one by hand; the controls are instance-admin **Check Now** (looks for new builds only) and **Pause All Updates** / **Resume Updates**. Titles, labels and named things use book title case; sentences stay sentence case. Status, readable build names, phased progress (co-located daemon → control plane → fleet), fleet table, history, and the one setting (servers updated at once). High Availability is read-only for the control plane.

---

## Layout (tokens + primitives only)

- Tokens from `src/lib/theme.ts`. Primitives from `@/components/ui`: `SectionPanel`, `DataTable`, `SettingRow`, `SegmentedControl`, `TextField`, `ConfirmButton`, `InlineNotice`, `StatusDot`, `Badge`, `CopyButton`, `WizardSteps`.
- Full-screen **TurboPanel is updating** overlay (`control-plane-updating-overlay.tsx`) while the control plane restarts (`control_plane_updating` or an active `control_plane` step). Prompt reload when `x-turbopanel-version` differs from the bundled client.

## Both editions: Status card (`updates-status-panel.tsx`)

- Headline with `StatusDot`: `TurboPanel is up to date` / `Update Waiting` / `Updating…` / `Needs Attention` / `Updates Paused` (paused leads). Status labels use one spelling in title case, the same in filters and badges (`Needs Attention`, `Up to Date`).
- Paused: "Updates paused since <local time> by <name>" (email, then "an administrator").
- What waits ("Waiting to update: control plane v…, and the daemon on some servers. It starts on its own at the next check.") and "Next check: <local time>" while not paused.
- "Last checked <local time>", and under it: "Check Now only looks for new builds. The next scheduled check starts the update."
- On a phone-width window (below `layout.desktopBreakpoint`) the two controls leave the header and sit full width in the card body, under the text, so the armed confirmation and any message have room. Messages from either control always show in the body; a "Checked a moment ago" line clears once its wait has passed.
- Header actions: **Check Now** (`Button`; a second check within a minute says "Checked a moment ago. Try again in N seconds." under it and stays usable) and `ConfirmButton` **Pause All Updates** (prompt: a run in progress finishes the servers it is updating, then stops) or **Resume Updates** (prompt: updates start again at the next check, with its time). A refusal shows beside the button.

## Self-hosted

1. **Status card** (above) plus the channel badge.
2. **Build names** — `Canary · Sep 19, 14:30` with version/commit behind **Details**.
3. **Step indicator** — `WizardSteps`: Preparing → Downloading → Installing → Restarting → Verifying → Done for co-located daemon, then control plane, then fleet summary + paged `DataTable` (status, version, step, error; the pager sits under the table). No Retry or Cancel: failed servers are retried on their own, shown as **Tries Again Later** with "Tries again at <local time>".
4. **Update history** — who or what started it, when, result; **See all** opens **Update History**, each run opens **Update Run**.
5. **Servers Updated at Once** — percent or count (default 100%); the next group starts on a later check once every server in this one has finished or failed.

Polling uses `refetchInterval` only while a run is `pending` / `running` (`useUpgradeActiveRun`).

## TurboPanel High Availability

- Control plane: **Managed by TurboPanel** (read-only version).
- Status card, rollout summary, connected daemons `DataTable` with filter chips, history, and **Servers Updated at Once**.
- Copy uses `HA_PRODUCT_NAME` from `src/lib/platform-copy.ts`.

## Org console

- Server detail **Daemon Update** panel: running / channel build, status badge, "Updates automatically" and **Clear Stuck Update** for managers. No per-server **Update**, no fleet batch **Update**, no row selection on the servers list.

## API (admin)

Documented in `src/lib/instance-api.md` — reads under `/api/admin/v1/instance/updates/*`, `POST …/check` (Check Now), `POST …/pause` / `…/resume`, and `GET` / `PUT …/settings` (batch only). Every manual start route answers 410 `updates_automatic`.
