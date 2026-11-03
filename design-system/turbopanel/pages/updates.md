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
- The two controls sit in the card body under the text at every width, never in the header slot (it does not shrink, so a long confirmation there clipped the card). The Pause / Resume confirmation uses `ConfirmButton stacked`: the buttons, then the question on its own full-width line. Resizing the window never closes an open confirmation. Messages from either control always show in the body; a "Checked a moment ago" line clears once its wait has passed.
- Card actions: **Check Now** (`Button`; a second check within a minute says "Checked a moment ago. Try again in N seconds." in the card and stays usable) and `ConfirmButton` **Pause All Updates** (prompt: a run in progress finishes the servers it is updating, then stops) or **Resume Updates** (prompt: updates start again at the next check, with its time). A refusal shows in the card body. While paused the card says "Updates are paused. Nothing new starts until they are resumed." instead of how updates install; labels read **Last Checked** and **Next Check**.

## Self-hosted

1. **Status card** (above) plus the channel badge and, while a control plane or web interface install waits, **Backup and Rollback**: the backup path and rollback command the next run uses, with **Copy Backup Path** and **Copy Rollback Command** (`CopyButton`).
2. **Build names** — `Canary · Sep 19, 14:30` with version/commit behind **Details**.
3. **Step indicator** — `WizardSteps`: Preparing → Downloading → Installing → Restarting → Verifying → Done for co-located daemon, then control plane, then fleet summary + paged `DataTable` (status, version, step, error; the pager sits under the table). No Retry or Cancel: failed servers are retried on their own, shown as **Tries Again Later** with "Tries again at <local time>".
4. **Update history** — who or what started it, when, result; **See all** opens **Update History**, each run opens **Update Run**.
5. **Servers Updated at Once** — percent or count (default 100%); the next group starts on a later check once every server in this one has finished or failed.

Polling uses `refetchInterval` only while a run is `pending` / `running` (`useUpgradeActiveRun`).

## TurboPanel High Availability

- Control plane: **Managed by TurboPanel** (read-only version).
- Status card, rollout summary, connected daemons `DataTable` with filter chips, history, and **Servers Updated at Once**.
- Copy uses `HA_PRODUCT_NAME` from `src/lib/platform-copy.ts`.

## Development installs

When `GET …/updates` says `development: true` (`development-updates.tsx`): no Status card, Check Now, Pause / Resume, check times, history or batch setting.

- `InlineNotice`: "Development installs never update on their own. Build the daemon from your checkout and push it to your servers when you're ready."
- **Versions** (`SectionPanel`): Control Plane, Web Interface, This Server's Daemon, each **Running From Your Checkout** and "Commit <short>" when known; no status badges.
- **Your Servers** (`SectionPanel`): primary **Build and Push Daemon** (**Push Daemon** when the checkout has not changed since the last build), disabled while a job runs; the last job (`Badge` Building… / Pushing… / Done / Failed, its message, each server's result); `DataTable` Server / Daemon / Status (**On Latest Build**, **Behind**, **Not Connected**); empty "No other servers are connected."
- The banner reads "Daemon changes are not on your servers yet." with **Open Updates**, only while servers lack the checkout's daemon changes.
- **Development Host bar** (under the banner in both shells, superadmin only): the `InlineNotice` shape with a violet (`colors.busy`) accent, red (`colors.error`) after a failed job. Title **Development Host**, one muted line per checkout that needs something, then the job line (violet step text, green **Updated**, or the failed step in `errorText` with the log tail in a recessed mono block). Actions on the right, wrapping under the copy on narrow widths: primary **Update and Restart**, secondary **Restart Only**, both `sm`. No dismiss: it goes away when nothing needs doing (a finished job keeps it up for a minute reading **Updated**). After 3 minutes without word from a restarting control plane or daemon, the job line turns `errorText` and points at the Developer Console.

## Org console

- Server detail **Daemon Update** panel: running / channel build, status badge, "Updates automatically" and **Clear Stuck Update** for managers. No per-server **Update**, no fleet batch **Update**, no row selection on the servers list.

## API (admin)

Documented in `src/lib/instance-api.md` — reads under `/api/admin/v1/instance/updates/*`, `POST …/check` (Check Now), `POST …/pause` / `…/resume`, and `GET` / `PUT …/settings` (batch only). Every manual start route answers 410 `updates_automatic`.
