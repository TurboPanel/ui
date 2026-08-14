# Page Override: Sign-in / Sign-up / Install

> Overrides MASTER for auth and first-run surfaces.

**Routes:** `/sign-in`, `/sign-up`, `/install`, `/connect`  
**Job:** Get a verified operator into the org console with zero chrome noise.

`/connect` uses the same auth shell. **Standalone Expo web** (Metro `:8081`): copy only — open via Caddy (`https://localhost:8443` / `http://localhost:8880`); no URL field and no status probe. **Native:** HA / localhost HTTPS / HTTP chips plus a custom URL; errors sit next to the field. No account switcher on web.

---

## Layout

- Centered single column; **TurboPanel T mark** and **page title** on one row above the form panel (mark left, title right-aligned) — not inside the box; no “Ops console” product line  
- Constrain the form column to **`maxWidth: 400`** (`AUTH_FORM_MAX_WIDTH`) — never full-bleed fields on desktop  
- Shared shell: `src/components/auth/auth-screen-shell.tsx` + `auth-form-styles.ts`; mark via `TurboPanelLogo` (T only — full wordmark is website-only)  
- One primary CTA (accent fill); secondary text link for alternate path below the panel  
- Footer copyright: `© {year} TurboPanel` (muted) under the panel / alt-path link  
- Install is a two-step host→superadmin flow — progressive disclosure, not one long form; same shell/column/`GlassSurface`/`AuthFloatingField` as sign-in, but **no** runtime accent tint and **no** backdrop streak motion (`animateBackdrop={false}`, muted chrome)

## Style

- Same OLED dark as the console (no light marketing theme swap)  
- **Runtime accent** from `GET /api/client/v1/status` → `runtime` (`src/lib/auth-accent.ts`):  
  - `workers` (TurboPanel High Availability) → blue `#3366cc`  
  - `deno` (self-hosted) → green `#3dd68c`  
- Form panel: **liquid glass** via `GlassSurface` (`glass.fill` + blur/saturate on web; native `GlassView` on iOS 26+), radius 12, soft lift, **2px runtime-accent top edge** — interaction container only, not a decorative card stack  
- Floating fields: soft glass fill on web (`glass.fillSoft` + light blur) so they sit inside the frosted panel  
- Page title ~22px / 500 weight above the panel; optional description under the title  

- Generous vertical rhythm vs dense dashboard pages (density dial conceptually ~4 here)  
- Tokens only from `src/lib/theme.ts` — no raw hex in auth screens  
- **Backdrop** (`AuthScreenBackground`): LinearGradient wash + tiled dashed SVG grid on all platforms (RN Web drops CSS `backgroundImage` on `View`); wash uses **opaque** accent→black mixes + extra stops (Safari bands/dithers alpha gradients); 4 Reanimated streaks via shared values; honor reduced motion  
- **Floating labels** (`AuthFloatingField`): label sits inside the field as the resting “placeholder”, then shrinks to the top on focus or when the field has a value; focused border + raised label use the runtime accent  
- Password visibility toggle is an **eye / eye-slash** icon button (`auth-eye-icons.tsx`) with an accessible name — not “Show” / “Hide” text  
- Bootstrap/recovery spinners: muted until `runtime` is known, then blue/green (`authSpinnerColor`); Sign In CTA spinner uses `onAccent`

## Motion

- Subtle field focus / button press only  
- Floating label raise/settle ~160ms  
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
- ❌ Text “Show” / “Hide” for password visibility on sign-in  
