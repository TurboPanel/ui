# Page Override: Sign-in / Sign-up / Install

> Overrides MASTER for auth and first-run surfaces.

**Routes:** `/sign-in`, `/sign-up`, `/install`  
**Job:** Get a verified operator into the org console with zero chrome noise.

---

## Layout

- Centered single column; panel title is the page name only (e.g. **Sign In**) — no “Ops console” product line  
- Constrain the form column to **`maxWidth: 400`** (`AUTH_FORM_MAX_WIDTH`) — never full-bleed fields on desktop  
- Shared shell: `src/components/auth/auth-screen-shell.tsx` + `auth-form-styles.ts`  
- One primary CTA (accent fill); secondary text link for alternate path below the panel  
- Footer copyright: `© {year} TurboPanel` (muted) under the panel / alt-path link  
- Install is a two-step host→superadmin flow — progressive disclosure, not one long form

## Style

- Same OLED dark as the console (no light marketing theme swap)  
- **Runtime accent** from `GET /api/client/v1/status` → `runtime` (`src/lib/auth-accent.ts`):  
  - `workers` (TurboPanel High Availability) → blue `#3366cc`  
  - `deno` (self-hosted) → green `#3dd68c`  
- Form lives in a single bordered panel (`bgPanel` + hairline `borderSubtle`, radius 12) — interaction container only, not a decorative card stack  
- Generous vertical rhythm vs dense dashboard pages (density dial conceptually ~4 here)  
- Tokens only from `src/lib/theme.ts` — no raw hex in auth screens  
- **Floating labels** (`AuthFloatingField`): label sits inside the field as the resting “placeholder”, then shrinks to the top on focus or when the field has a value; focused border + raised label use the runtime accent  
- Password visibility toggle is an **eye / eye-slash** icon button (`auth-eye-icons.tsx`) with an accessible name — not “Show” / “Hide” text

## Motion

- Subtle field focus / button press only  
- Floating label raise/settle ~160ms  
- No hero video, no ambient blob backgrounds

## Anti-patterns

- ❌ Purple gradient auth cards  
- ❌ Full-width inputs on desktop (≥768)  
- ❌ “Ops console” / dual-line product chrome above the form  
- ❌ Hardcoding blue on Deno auth (or green on Workers auth)  
- ❌ Emoji in validation messages as primary icons  
- ❌ Placeholder-only fields with no visible label when empty *and* when filled (floating label must remain visible when raised)  
- ❌ Text “Show” / “Hide” for password visibility on sign-in  
