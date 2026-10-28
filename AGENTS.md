# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Project metadata / public naming

| Public name | GitHub | Internal term |
| --- | --- | --- |
| TurboPanel UI | [TurboPanel/ui](https://github.com/TurboPanel/ui) | `ui` |

Main product: [TurboPanel/turbopanel](https://github.com/TurboPanel/turbopanel) (TurboPanel Control Plane). **License:** AGPL-3.0-only with the [Apple App Store additional permission](./LICENSES/TurboPanel-Apple-App-Store-Additional-Permission.txt) (`LICENSE` stays unmodified AGPLv3; keep `package.json` `"license": "AGPL-3.0-only"` — do not invent an SPDX exception identifier). **Maturity:** **Private alpha**. README is product-facing; AGENTS.md is maintainer-facing. This repo is not deployed standalone — Caddy serves the control plane export.

## Releases

How changes ship: squash-merge into `trunk`, then two bot-opened pull requests (`trunk` to `staging`, `staging` to `live`) that a maintainer merges with merge commits. Hotfixes land on `trunk` first, and the daemon ships before the control plane. See [How changes ship](https://github.com/TurboPanel/.github/blob/trunk/CONTRIBUTING.md#how-changes-ship) and [How to ship](https://turbopanel.io/docs/development/how-to-ship).

## Documentation discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## At a glance

| Need | Go to |
|------|--------|
| **Any visual / UX work** | [Design system (ui-ux-pro-max)](#design-system-ui-ux-pro-max) — mandatory skill + MASTER/page workflow |
| **Building / reusing a component** | [Component layer](#component-layer) — `src/components/ui` barrel; `ui/` never imports from `org/` |
| **Agent skills** | [Agent skills](#agent-skills) — canonical `.agents/skills/` footprint |
| Stack / fonts / Tamagui | [Stack](#stack) |
| Auth, install, sign-up | [End-user auth & first-run install](#end-user-auth--first-run-install-self-hosted) |
| Org routes & shell | [Organization console](#organization-console-organizationid) |
| API helpers & contracts | `src/lib/instance-api.md` (helper → endpoint contract) + `src/lib/instance-api.ts` |
| Server state / queries | [Server state (React Query)](#server-state-react-query) + `src/lib/query-keys.ts` + `src/lib/queries/` |
| Admin surface | [Admin area](#admin-area-admin) |
| Commands / polling | [Command Pipeline UI](#command-pipeline-ui) + `src/lib/queries/commands.ts` |
| Deploy modes | [Build output & deployment](#build-output--deployment-dev-vs-prod) |
| Pre-commit / typecheck | [Testing & pre-commit](#testing--pre-commit) |

## Testing & pre-commit

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` — same gate as CI `verify.yml` and deploy |
| (CI only) `ci-ok` | Aggregator job in `verify.yml`: needs `verify`, fails on any failure/cancel/skip — the one check the trunk ruleset requires. On a PR it always runs (a cancelled PR run is red); on a trunk push a cancelled run leaves it skipped (grey), so only a real failure is red |
| `pnpm lint` | Expo ESLint |
| `pnpm check:vocabulary` | Reject daemon-as-agent and Apple-associated chrome phrasing (`src/lib/vocabulary.ts` + `scripts/check-vocabulary.mjs`) |
| `pnpm notices:generate` | Write `THIRD_PARTY_NOTICES.md` from the resolved pnpm graph plus committed bundled resources (fonts). After Expo prebuild / EAS, the same script collects CocoaPods, Gradle, and AAR/POM metadata (`--native`) |
| `pnpm notices:check` | JS-only (`--js-only`): fail when notices are stale vs the lockfile, or a production dependency has an unreviewed license class. Clean-checkout CI uses this so a missing native tree is not a failure |
| `pnpm notices:check:native` | Same check plus fail when a native build is expected but the CocoaPods / Gradle / AAR graph is absent. EAS `eas-build-post-install` generates with `--native` |
| `pnpm test` | Vitest once |
| `pnpm test:coverage` | Vitest + LCOV (`coverage/lcov.info`) — CI `verify.yml` runs this, then SonarCloud |

**Where to run tests:** host VirtFS checkouts lack a usable Node/pnpm tree
(`node_modules` is bind-mounted inside the guest). Run suites **inside the
Vagrant guest** from the host `dev` checkout. Canonical detail:
`../dev/AGENTS.md` → Testing. Do not run `pnpm test` on the host.

```bash
vagrant ssh -c 'export PATH="/opt/turbopanel/vendor/node/current/bin:$PATH"; cd ~/ui && pnpm test'
# CI-parity (vocabulary + notices + typecheck + LCOV; skips `pnpm lint` because it autofixes):
vagrant ssh -c 'export PATH="/opt/turbopanel/vendor/node/current/bin:$PATH"; cd ~/ui && pnpm verify:ci'
```

**No flaky tests:** a test must give the same result on every run. Do not use unseeded randomness (`crypto.randomUUID`, `Math.random`, random bytes) as input where an assertion or a fake keys on the content, prefix, order or collision of the value (a random hex string can contain any short letter run, and a base64 one can contain `+` or `/`); use a fixed value, or a seeded one. Do not rely on tight real-time margins (a `setTimeout` of a few ms, an elapsed-time `>=`): wait for the condition with a polling helper and a generous ceiling, or inject a clock. Do not make wall-clock expectations without a fixed clock (`Date.now()`, `new Date()`, midnight, month and DST edges). Do not depend on test order or on state shared between tests.

**CI:** `.github/workflows/verify.yml` runs lint, `check:vocabulary`, `notices:check`, typecheck, `pnpm test:coverage`,
then a SonarCloud scan with `sonar.qualitygate.wait=true` (`SONAR_TOKEN` required).
Automatic Analysis must stay **off** for `turbopanel_ui`.
`pnpm-workspace.yaml` `allowBuilds` must keep native postinstalls (`esbuild`,
`workerd`, `sharp`, …) approved; pnpm 12 `strictDepBuilds` otherwise fails
`pnpm install` with `ERR_PNPM_IGNORED_BUILDS`.

- Lint/typecheck/tests still belong in CI/deploy and can be run manually with `pnpm lint` / `pnpm check:vocabulary` / `pnpm notices:check` / `pnpm typecheck` / `pnpm test` / `pnpm test:coverage`.
- **`pnpm lint` writes to the working tree.** `expo lint` applies ESLint autofixes, including `react-hooks/exhaustive-deps` on files you never touched — and widening a deps array changes when that effect re-runs. Check `git status` after linting and revert edits outside your change.

## Organization console (`/<organizationId>/*`)

Moved to `src/app/[orgId]/AGENTS.md` — layout/chrome, area routes, instance
API usage, servers/metrics pages, compose panels. Read it before editing
anything under `src/app/[orgId]/`.

