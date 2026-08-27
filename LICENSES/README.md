# Additional permissions

This repository is licensed under GNU AGPL-3.0-only. The AGPL text in
[`LICENSE`](../LICENSE) is unmodified.

| File | Role |
| --- | --- |
| [`TurboPanel-Apple-App-Store-Additional-Permission.txt`](./TurboPanel-Apple-App-Store-Additional-Permission.txt) | Additional permission under GNU AGPLv3 section 7 for Apple App Store object-code distribution |

Keep `package.json` `"license": "AGPL-3.0-only"`. Do not invent an SPDX
exception identifier for this project-specific permission.

The Apple App Store additional permission applies **only** to material
TurboPanel has authority to license. It is not an exception to a third
party's copyright license or trademark terms, and it does not cover
third-party OS artwork under [`assets/os/NOTICE.md`](../assets/os/NOTICE.md).

Corresponding Source for each published store binary and EAS Update is
the exact revision used to produce that artifact — not `trunk`.
`app.config.ts` records `gitCommit` and `sourceReleaseUrl` from
`EAS_BUILD_GIT_COMMIT_HASH` (EAS Build), `EXPO_PUBLIC_GIT_COMMIT` /
`GITHUB_SHA`, or `git rev-parse HEAD` (EAS Update via `pnpm eas:update`).
Expo evaluates the config as Node ESM (after compiling it to `app.config.js`),
so the config imports `src/lib/source-release-node.mjs` — not the extensionless
TypeScript module, which Node cannot resolve.
Production EAS Build, store build, and EAS Update **fail fast** when a full
git commit cannot be resolved — the source URL must be `/tree/<full-sha>`.
Local development may fall back to the repository root and marks
`extra.release` false so that state is visibly non-release.
Native **Settings → About** (`/about`) shows the license, version/build, and
that source URL.

`pnpm notices:generate` writes `THIRD_PARTY_NOTICES.md` from the resolved
dependency graph (`pnpm licenses list`, plus CocoaPods / Gradle trees after
Expo prebuild). Third-party components stay under their own licenses; they
are not relicensed by this repository's AGPL. `@resvg/resvg-js` is a
devDependency of `scripts/render-os-logos.mjs` and must stay classified
development-only. CI `pnpm notices:check` fails when the file is stale or a
production dependency introduces an unreviewed license class.
