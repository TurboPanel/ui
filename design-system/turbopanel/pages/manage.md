# Page Override: Organization Manage

> Overrides `design-system/turbopanel/MASTER.md` for `/[orgId]/manage`.

**Route:** `src/app/[orgId]/manage` → `manage-section.tsx`  
**Job:** Organization record — view / rename the org; ID and created date are read-only.

---

## Layout

- Page title **Manage Organization**, then the Organization form in a `SectionPanel`
- No fleet tiles, charts, or extra settings groups on this page
- Distinct from **Managed** (`/[orgId]/managed` — database/engine inventory)

## Organization form

- Visible **Name** label (never placeholder-only); `accessibilityLabel="Organization name"`
- Managers rename via `PATCH /organizations/:id`; Save stays disabled until the draft differs; button shows **Saving…** while pending
- Non-managers see the name as read-only text
- ID + created date stay in a read-only identity block (monospace ID, selectable)
- Errors sit next to the name field

## Navigation

- Not a sidebar / web-menu area (same pattern as Workspaces)
- Header org switcher **Manage** button (and per-row gear on `/organizations`) opens this route
- Native: not a bottom tab; reach via the compact org menu, the full switcher, or a deep link

## Anti-patterns (page-specific)

- ❌ Fleet status tiles or dashboard widgets
- ❌ Placeholder-only name field
- ❌ Confusing this area with Managed services
- ❌ Adding this page to `ORG_AREAS` / the web sidebar
