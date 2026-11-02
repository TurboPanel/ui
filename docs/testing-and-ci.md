# Testing and CI

**No flaky tests:** a test must give the same result on every run. Do not use unseeded randomness (`crypto.randomUUID`, `Math.random`, random bytes) as input where an assertion or a fake keys on the content, prefix, order or collision of the value (a random hex string can contain any short letter run, and a base64 one can contain `+` or `/`); use a fixed value, or a seeded one. Do not rely on tight real-time margins (a `setTimeout` of a few ms, an elapsed-time `>=`): wait for the condition with a polling helper and a generous ceiling, or inject a clock. Do not make wall-clock expectations without a fixed clock (`Date.now()`, `new Date()`, midnight, month and DST edges). Do not depend on test order or on state shared between tests.

**CI:** `.github/workflows/verify.yml` runs lint, `check:vocabulary`, `notices:check`, typecheck, `pnpm test:coverage`,
then a SonarCloud scan with `sonar.qualitygate.wait=true` (`SONAR_TOKEN` required).
Automatic Analysis must stay **off** for `turbopanel_ui`.

**Fork pull requests.** CI runs on `pull_request` only (never `pull_request_target`), so a run from a fork gets a read-only token and no secrets, and waits for a maintainer to approve it (a repository Actions setting, not workflow code). The code scan and the no-new-issues step skip there; the `Note a skipped code scan` step then writes a notice and a job summary that say why and that a maintainer will push the branch to the TurboPanel repository if a scan is needed. Formatting, the vocabulary check, the secret scan and the tests run as usual, and `ci-ok` still requires every needed job to succeed: a step skipped inside a job leaves the job green, while a skipped or cancelled job turns `ci-ok` red.

`pnpm-workspace.yaml` `allowBuilds` must keep native postinstalls (`esbuild`,
`workerd`, `sharp`, …) approved; pnpm 12 `strictDepBuilds` otherwise fails
`pnpm install` with `ERR_PNPM_IGNORED_BUILDS`.
