# Source Tree Rules — AGENTS.md

### TypeScript style (SonarQube)

- Prefer **`String#replaceAll()`** over **`String#replace()` with a global regex** when replacing every occurrence of a substring (`typescript:S7781`).
- Use **`String.raw`** for string literals that contain backslashes so escapes stay readable and correct (`typescript:S7780`).
- Prefer **optional chaining** (`obj?.prop`) over `!obj || obj.prop` (`typescript:S6582`).
- Avoid **nested ternaries** — use `if`/`switch` or helpers (`typescript:S3358`).
- Extract helpers when **cognitive complexity** exceeds 15 (`typescript:S3776`). Closures inside a component (async handlers, JSX callback props, `.map` bodies) are charged to the component at +1 nesting, so move logic into a custom hook, a module-level helper, or a child component rather than another inline arrow.
- Sort strings with **`.sort((a, b) => a.localeCompare(b))`** (`typescript:S2871`).
- Mark React component props **`Readonly<{…}>`** (`typescript:S6759`).
- Do not leave **`TODO`** in code — use `Future:` in a normal comment (`typescript:S1135`).
- Avoid widening unions with bare **`string`** when a literal union exists (`typescript:S6571`).
- Web-only CSS (`position: 'sticky'`, `overflowX`, `backdropFilter`, …) is not in RN `ViewStyle` — cast via `as unknown as ViewStyle` (same pattern as `src/lib/glass.ts`). Do **not** use `as const` on those objects inside `StyleSheet.create` or `tsc` fails.


Authored Tamagui config lives in `babel.config.cjs`, `src/lib/tamagui.config.ts`, and `src/lib/theme.ts` — never commit `.tamagui/` generated cache.

## Stack

- **Expo SDK 57** (React Native 0.86, React 19.2) — keep Expo module versions aligned with `pnpm expo install --fix`. Native `ios/` / `android/` are not checked in (CNG).
- **Tamagui** `^2.0.0-rc.26` — configured via `babel.config.cjs` (not `app.json` plugins); `reactCompiler` experiment is disabled to avoid conflicts with the Tamagui babel plugin.
- **React Query** `^5.90.14` — see [Server state (React Query)](#server-state-react-query) below.
- **Fonts** — `RootLayout` registers everything through `useFonts` and returns `null` until the fonts are ready. v4 type is Plus Jakarta Sans (700; 800 italic for page titles), Geist (400 / 500 / 600) and Geist Mono (400 / 500 / 600), packaged from `@expo-google-fonts/*` and bundled as same-origin assets: on the web `font-src 'self' data:` already covers them (`scripts/hosted-security-headers.test.ts` keeps it that way), and no font host is linked. Each weight is its own family name (`Geist_500Medium`); `src/lib/v4/typography.ts` maps roles to those names and never sets `fontWeight` beside them, because a phone applies it unreliably to a custom font. A test keeps the `useFonts` map and the role table equal. The old `@tamagui/font-inter` files stay loaded until no screen uses them. A new font weight needs the same three steps: `pnpm add`, a `useFonts` entry, a role in `typography.ts`; then `pnpm notices:generate`.


