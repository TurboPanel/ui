# AGENTS.md

Expo web UI for TurboPanel. Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
This is a short root. Nested `AGENTS.md` files hold the rules for the directory they sit in; the nearest one to the file you edit wins. Long runbooks live in `docs/`.

## Project Metadata and Public Naming

| Public name   | GitHub                                            | Internal term |
| ------------- | ------------------------------------------------- | ------------- |
| TurboPanel UI | [TurboPanel/ui](https://github.com/TurboPanel/ui) | `ui`          |

Main product: [TurboPanel/turbopanel](https://github.com/TurboPanel/turbopanel) (TurboPanel Control Plane). **License:** AGPL-3.0-only with the [Apple App Store additional permission](./LICENSES/TurboPanel-Apple-App-Store-Additional-Permission.txt) (`LICENSE` stays unmodified AGPLv3; keep `package.json` `"license": "AGPL-3.0-only"` — do not invent an SPDX exception identifier). **Maturity:** **Private alpha**. README is product-facing; AGENTS.md is maintainer-facing. This repo is not deployed standalone — Caddy serves the control plane export.

Licensing, notices and store provenance: [docs/licensing-and-provenance.md](./docs/licensing-and-provenance.md).

## Releases

How changes ship: squash-merge into `trunk`, then two bot-opened pull requests (`trunk` to `staging`, `staging` to `live`) that a maintainer merges with merge commits. Hotfixes land on `trunk` first, and the daemon ships before the control plane. See [How changes ship](https://github.com/TurboPanel/.github/blob/trunk/CONTRIBUTING.md#how-changes-ship) and [How to ship](https://turbopanel.io/docs/development/how-to-ship). The manual promotion form (`.github/workflows/promote.yml`) is the break-glass path, for when the automatic path cannot run ([docs/deployment-and-identifiers.md](./docs/deployment-and-identifiers.md)).

## Documentation Discipline

**Keep this file current.** When you learn something durable about the UI — instance API shapes, developer/diagnostic panels, fetch patterns, Expo constraints — add or update a note here alongside code changes.

- Prefer extending an existing section over orphan bullets.
- Record **why** when non-obvious.
- API contracts live in `src/lib/instance-api.ts`; mirror instance changes there and note breaking shapes here.
- Do not record secrets or environment-specific URLs as if they were universal.
- Remove or correct notes that prove wrong.

## Commands

| Command                     | Purpose                                                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck`            | `tsc --noEmit` — same gate as CI `verify.yml` and deploy                                                                                                                                                                                                                 |
| (CI only) `ci-ok`           | Aggregator job in `verify.yml`: needs `verify`, fails on any failure/cancel/skip — the one check the trunk ruleset requires. On a PR it always runs (a cancelled PR run is red); on a trunk push a cancelled run leaves it skipped (grey), so only a real failure is red |
| `pnpm lint`                 | Expo ESLint                                                                                                                                                                                                                                                              |
| `pnpm check:vocabulary`     | Reject daemon-as-agent and Apple-associated chrome phrasing (`src/lib/vocabulary.ts` + `scripts/check-vocabulary.mjs`)                                                                                                                                                   |
| `pnpm notices:generate`     | Write `THIRD_PARTY_NOTICES.md` from the resolved pnpm graph plus committed bundled resources (fonts). After Expo prebuild / EAS, the same script collects CocoaPods, Gradle, and AAR/POM metadata (`--native`)                                                           |
| `pnpm notices:check`        | JS-only (`--js-only`): fail when notices are stale vs the lockfile, or a production dependency has an unreviewed license class. Clean-checkout CI uses this so a missing native tree is not a failure                                                                    |
| `pnpm notices:check:native` | Same check plus fail when a native build is expected but the CocoaPods / Gradle / AAR graph is absent. EAS `eas-build-post-install` generates with `--native`                                                                                                            |
| `pnpm test`                 | Vitest once                                                                                                                                                                                                                                                              |
| `pnpm test:coverage`        | Vitest + LCOV (`coverage/lcov.info`) — CI `verify.yml` runs this, then SonarCloud                                                                                                                                                                                        |

**Where to run tests:** host VirtFS checkouts lack a usable Node/pnpm tree
(`node_modules` is bind-mounted inside the guest). Run suites **inside the
Vagrant guest** from the host `dev` checkout. Canonical detail:
`../dev/AGENTS.md` → Testing. Do not run `pnpm test` on the host.

```bash
vagrant ssh -c 'export PATH="/opt/turbopanel/vendor/node/current/bin:$PATH"; cd ~/ui && pnpm test'
# CI-parity (vocabulary + notices + typecheck + LCOV; skips `pnpm lint` because it autofixes):
vagrant ssh -c 'export PATH="/opt/turbopanel/vendor/node/current/bin:$PATH"; cd ~/ui && pnpm verify:ci'
```

Flaky-test rules, CI jobs and the `allowBuilds` note: [docs/testing-and-ci.md](./docs/testing-and-ci.md).

- Lint/typecheck/tests still belong in CI/deploy and can be run manually with `pnpm lint` / `pnpm check:vocabulary` / `pnpm notices:check` / `pnpm typecheck` / `pnpm test` / `pnpm test:coverage`.
- **`pnpm lint` writes to the working tree.** `expo lint` applies ESLint autofixes, including `react-hooks/exhaustive-deps` on files you never touched — and widening a deps array changes when that effect re-runs. Check `git status` after linting and revert edits outside your change.

## Always and Never

- Never commit `.tamagui/` cache, secrets or dotenv files; the pre-commit secret scan cannot be skipped ([docs/pre-commit-and-secret-scan.md](./docs/pre-commit-and-secret-scan.md)).
- Never run `pnpm test` on the host; use the Vagrant guest.
- Never use `fetch` plus `useEffect` caches or hand-rolled poll loops for server data; use React Query (`src/lib/queries/AGENTS.md`).
- Never hard-code hex colors in components; use `src/lib/theme.ts` tokens (`design-system/AGENTS.md`).
- Never import from `org/` inside `src/components/ui/` (`src/components/AGENTS.md`).
- Never use the word "agent" for the daemon in product copy, and never use Apple-associated chrome phrasing (`pnpm check:vocabulary`).
- Always read the nearest `AGENTS.md` and, for any visual work, the design-system guide before editing.

## Where Rules Live

| Working on                                        | Read                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| Any visual or UX work, tokens, themes             | `design-system/AGENTS.md` (mandatory skill and Master/page workflow)       |
| Shared components, `src/components/ui` barrel     | `src/components/AGENTS.md`                                                 |
| Org chrome, pull-to-refresh, org scroll           | `src/components/org/AGENTS.md`                                             |
| Stack, fonts, Tamagui, TypeScript style           | `src/AGENTS.md`                                                            |
| API helpers, contracts, step-up, command pipeline | `src/lib/AGENTS.md`, `src/lib/instance-api.md`, `src/lib/instance-api.ts`  |
| Server state, query keys, polling                 | `src/lib/queries/AGENTS.md`, `src/lib/query-keys.ts`                       |
| Project editor logic                              | `src/lib/v4/AGENTS.md`                                                     |
| Organization console routes                       | `src/app/[orgId]/AGENTS.md` (plus `projects/`, `servers/`)                 |
| Admin area                                        | `src/app/admin/AGENTS.md`                                                  |
| Sign-in, sign-up, first-run install               | [docs/auth-and-install.md](./docs/auth-and-install.md)                     |
| Dev vs production build, promotion, identifiers   | [docs/deployment-and-identifiers.md](./docs/deployment-and-identifiers.md) |
| Code analysis setup                               | [docs/sonarqube.md](./docs/sonarqube.md)                                   |
| Skills footprint                                  | [docs/agent-skills.md](./docs/agent-skills.md)                             |
