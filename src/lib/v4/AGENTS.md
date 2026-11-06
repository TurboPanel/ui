# Project Editor Logic — AGENTS.md

## Project editor logic (`src/lib/v4/`)

Framework-free logic for the Base + environment changes screens (no UI, no storage, no network):
environment map layout (`map-layout.ts`), "Runs as" and Linux user rules (`linux-users.ts`), change labels
(`change-labels.ts`), the Base-plus-changes comparison (`effective-config.ts`) and the derived
"Follows the Base / Stands alone" rule (`follows-base.ts`).

- Configurations are flat maps (`svc:{serviceId}:{row}`, `var:{NAME}`); the compose merge itself stays on the server
  (config-view endpoint), so there is no third copy of the merge rules here.
- "Stands alone" is never stored: it is derived from the saved environment compose (`services: !override`).
- Linux user names follow the server limit (28 characters, 16 with the default name scheme), not just the design spec's 28. The control plane answers 400 `username_reserved` when a site owner's Linux user would collide with a host system user or group; the add form maps that (and `username_too_long` / `username_in_use`) to plain words and does not keep a second copy of those names.
- **Environment Configuration tab** (`configuration/index.tsx` -> `components/org/project/configuration/`): reads
  `GET /environments/:id/config-view` (`useEnvironmentConfigView`, key `environments.configView`) and shows
  Apps, Domains, Variables, Linux users and Data with a source tag on every row; `config-view-model.ts` turns the answer into rows.
  The config-view keys use the compose service **name** (`svc:web:command`), not the flat `svc:{serviceId}:{row}` keys above, so the
  model reads the server's own labels. "Only changes from Base" swaps the page for one row per change. Variables show "Project" when
  they come from the project, and secret values are never shown.
- **Editing on that tab is staged, then saved.** Row editors and the change buttons (Go back to Base, Make this the Base) only stage edits
  (`config-edits.ts`, one per row key); the pending bar says "N unsaved changes" and **Save changes** runs `saveEdits` (`config-save.ts`).
  The one exception is **Add variable**: Add saves that one edit at once (`useStagedEdits().saveNow`), like every other Add in the console,
  and keeps the editor open with the reason when it does not go through. While edits are unsaved or a save runs, the browser asks before
  the page is left (`useLeaveWarning`). Save changes:
  fresh project, environment and variable data first, then Base compose, environment compose, variables (writes before deletes), using
  `PATCH /projects/:id`, `PATCH /environments/:id` and the variable routes. It never deploys; a saved change goes live on the next deploy.
  The writers (`config-compose.ts`) delete the environment's entry to go back (never `!reset`, which removes the Base value) and restate
  `serviceKind` and `source.sourceId` in the environment's layer for any `x-turbopanel` change, because the control plane checks a layer
  alone (a Node.js app "requires source"; `principal` is only valid on a site or Node.js app). Scope: one environment in the project means
  the Base; a stand-alone environment (the control plane's rule: `services: !override` or `!reset`) means that environment only.
- Copy uses the v4 words (Base, "{env} change", Follows the Base, Stands alone, Runs as). `vocabulary.test.ts` fails on
  banned words in module output and text literals.


