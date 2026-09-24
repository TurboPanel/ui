# Page Override: Sign-in / Sign-up / Install

> Overrides MASTER for auth and first-run surfaces.

**Routes:** `/sign-in`, `/sign-up`, `/install`, `/connect`  
**Job:** Get a verified operator into the org console with zero chrome noise.

`/connect` uses the same auth shell. **Standalone Expo web** (Metro `:8081`): copy only — open via Caddy (`https://localhost:8443`) and trust the Platform CA; no URL field and no status probe. **Native:** HA / localhost HTTPS chips plus a custom URL; errors sit next to the field. On a phone, localhost is the device — use `https://<LAN host>:8443` and trust the Platform CA. No account switcher on web.

---

## Layout

- Centered single column; **TurboPanel T mark** and **page title** on one row above the form panel (mark left, title right-aligned) — not inside the box; no “Ops console” product line  
- Constrain the form column to **`maxWidth: 400`** (`AUTH_FORM_MAX_WIDTH`) — never full-bleed fields on desktop  
- Shared shell: `src/components/auth/auth-screen-shell.tsx` + `auth-form-styles.ts`; mark via `TurboPanelLogo` (T only — full wordmark is website-only)  
- One primary CTA (accent fill); secondary text link for alternate path below the panel  
- Footer copyright: `© {year} TurboPanel` (muted) under the panel / alt-path link  
- Install is a two-step host→superadmin flow — progressive disclosure, not one long form; same shell/column/`GlassSurface`/`AuthFloatingField` as sign-in, but **no** runtime accent tint and **no** backdrop streak motion (`animateBackdrop={false}`, muted chrome)

## Second factor & passkeys

`POST /auth/sign-in` may answer with a pending factor instead of a session. Both extra states live in the **same shell and panel** as the password form — a second factor is a step, not a route, and the challenge is short-lived.

- **Code step** (`two-factor-step.tsx`): title swaps to “Two-factor authentication”, the panel body swaps to one `AuthFloatingField` labelled **“Authentication code”** plus the standard accent CTA (**Verify** / *Verifying…*). A short muted line above the field says where the code comes from. The CTA stays disabled until the code is plausibly complete (6 digits) so an obvious typo never spends an attempt.
- **Backup-code toggle**: a footer-styled accent `Pressable` (**“Use a backup code”** ⇄ **“Use your authenticator app”**), not a `SegmentedControl` — it is an escape hatch, not a co-equal mode. Toggling clears the field and relabels it **“Backup code”**; the copy, label, keyboard, and autofill hint come from `src/lib/two-factor-prompt.ts`. Below it, a muted **“Back to sign in”** returns to the password form.
- **Passkey button**: a footer-styled accent `Pressable` (**“Sign in with a passkey”**, *“Waiting for passkey…”* while the ceremony is open) under the Sign In CTA. Rendered **only** when `isPasskeySupported()` — web, same-origin control plane. It is deliberately not a second filled CTA: one accent fill per panel. Ceremony failures surface in the existing `error` line, never a modal.

## Third-party sign-in

Provider buttons sit **below** the passkey link and use the same footer-styled accent text — never a second filled CTA (one accent fill per panel). They appear only for entries in `InstallStatus.authProviders` (`github` / `google`). On web (same-origin) each button is a top-level navigation via `Linking.openURL(oauthStartUrl(provider, { redirectTo: currentRedirect }))` — never `fetch`. `currentRedirect` is the current `/sign-in` route plus leftover query (`signInOAuthRedirect`). On native or a cross-origin control plane the buttons are omitted and a short **“Sign in with GitHub or Google from a browser”** note is shown instead (`OAUTH_WEB_ONLY_NOTE`).

`?error=` from the OAuth callback lands in the existing `error` line (known codes mapped to short copy; unknown codes fall back to a generic message). `?challenge=` sets the existing `challenge` state so the flow drops into `TwoFactorStep` without a route change.

## Style

- Same OLED dark as the console (no light marketing theme swap)  
- **Runtime accent** from `GET /api/client/v1/status` → `runtime` (`src/lib/auth-accent.ts`):  
  - `workers` (TurboPanel High Availability) → blue `#3366cc`  
  - `deno` (self-hosted) → green `#3dd68c`  
- Form panel: **frosted chrome** via `GlassSurface` (`glass.fill` + blur/saturate on web; native `GlassView` on iOS 26+), radius 12, soft lift, **2px runtime-accent top edge** — interaction container only, not a decorative card stack  
- Floating fields: soft glass fill on web (`glass.fillSoft` + light blur) so they sit inside the frosted panel  
- Page title ~22px / 500 weight above the panel; optional description under the title  

- Generous vertical rhythm vs dense dashboard pages (density dial conceptually ~4 here)  
- Tokens only from `src/lib/theme.ts` — no raw hex in auth screens  
- **Backdrop** (`AuthScreenBackground`): LinearGradient wash + tiled dashed SVG grid on all platforms (RN Web drops CSS `backgroundImage` on `View`); wash uses **opaque** accent→black mixes + extra stops (Safari bands/dithers alpha gradients); 4 Reanimated streaks via shared values; honor reduced motion  
- **Floating labels** (`AuthFloatingField`): label sits inside the field as the resting “placeholder”, then shrinks to the top on focus or when the field has a value; focused border + raised label use the runtime accent. The label paints **above** the input (Chrome autofill would hide a label behind an opaque fill) but must ignore pointer events for the whole raise — first click focuses and stays focused so paste works.  
- Password visibility toggle is an **eye / eye-slash** icon button (`auth-eye-icons.tsx`) with an accessible name — not “Show” / “Hide” text  
- Bootstrap/recovery spinners: muted until `runtime` is known, then blue/green (`authSpinnerColor`); Sign In CTA spinner uses `onAccent`

## Motion

- Subtle field focus / button press only  
- Floating label raise/settle ~160ms (0ms when `useReducedMotion`)  
- Backdrop: **2 horizontal + 2 vertical** hairline streaks (accent-tinted, bright tip); each lap picks a random grid line; honor `useReducedMotion` (no streaks)  
- No hero video, no ambient blob backgrounds, no pulsing glow / neon scan lines

## Anti-patterns

- ❌ Purple gradient auth cards  
- ❌ Full-width inputs on desktop (≥768)  
- ❌ “Ops console” / dual-line product chrome above the form  
- ❌ Hardcoding blue on Deno auth (or green on Workers auth)  
- ❌ Defaulting the HA bootstrap spinner to green before `/status` returns  
- ❌ Emoji in validation messages as primary icons  
- ❌ Placeholder-only fields with no visible label when empty *and* when filled (floating label must remain visible when raised)  
- ❌ Letting the floating-label animation eat the first click (label must ignore pointer events for the whole raise, including mid-tween frames)  
- ❌ Text “Show” / “Hide” for password visibility on sign-in  
- ❌ A second filled CTA for passkeys or OAuth providers (one accent fill per panel — both are text links)  
- ❌ Routing the second factor to its own screen, or rendering it in a modal over the sign-in form  
- ❌ Showing the passkey button on native or on a cross-origin control plane (gate on `isPasskeySupported()`)  
