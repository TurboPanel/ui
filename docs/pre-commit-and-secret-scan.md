# Pre-Commit and Secret Scan

**Pre-commit** (`.githooks/pre-commit`): secret scan only (never skippable). `scripts/scan-secrets.sh`, `scripts/scan-secrets.patterns` and `scripts/scan-secrets.selftest.sh` are byte-identical in turbopanel, turbopaneld, ui, website and dev: change all five together (each repo keeps a copy because the pre-commit hook runs it locally). The rules in the patterns file cover private key blocks, vendor tokens, JWTs, connection URLs with credentials, secret-looking assignments and forbidden file names (dotenv files, `*.pem`, `*.key`, daemon identity files, …); the scanner reports the rule id and location, never the matching text. `--all` scans the tree; `--range BASE..HEAD` scans every line the PR's commits added, so a secret added and removed inside a PR is still caught (CI runs it on PRs into trunk). Allowlist entries in `.secretscan-allowlist` are `path:full line text` (or `@path exact/file` for a forbidden file name), each needs a `# reason:` comment above it, and wildcards are rejected. The self-test builds its fixtures at run time from fragments; dev's `src/lib/scan-secrets.test.ts` runs it and, with the siblings checked out in dev CI, fails if any copy drifts.
Lint/typecheck/tests are **temporarily disabled** in the hook until the
toolchain can run inside the Vagrant guest. Requires `core.hooksPath=.githooks`
(otherwise Git never runs the hook).

- **`pnpm install`** runs `prepare` → `scripts/ensure-git-hooks.sh`, which sets `core.hooksPath=.githooks` locally.
- Dev console `./console` / `ensureAllGitHooksPaths` also wires every co-located checkout.
- After a fresh clone, run `pnpm install` (or `sh scripts/ensure-git-hooks.sh`) before committing; confirm with `git config --local --get core.hooksPath` → `.githooks`.

