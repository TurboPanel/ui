// `pnpm deploy` with no environment is refused on purpose: the top-level Worker
// (`dev-ui`) exists only for local `wrangler dev`, and a bare `wrangler deploy`
// used to land on production. Name the target instead.
console.error(
  'ui: choose an environment — `pnpm deploy:testing` (testing-ui) or `pnpm deploy:live` (ui). ' +
    'There is no default deploy target.',
)
process.exit(2)
