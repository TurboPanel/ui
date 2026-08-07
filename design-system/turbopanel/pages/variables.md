# Page Override: Variables

> Overrides `design-system/turbopanel/MASTER.md` for environment/project/hosting variable panels.

**Components:** `variables-section.tsx` (reusable; `embedded` nests under cards), `project-variables-section.tsx` (project scope on project detail), hosting card in `environment-detail-section.tsx`  
**Job:** Add/edit/delete vars and secrets for compose substitution at each inheritance scope.

---

## Layout

- **Project detail:** inheritance chip “Inherited by all environments unless overridden…”
- **Environment detail:** full Variables panel (environment scope)
- **Hosting card (Hostnames):** embedded VariablesSection after “Save hosting”; gated until a hosting row exists
- **Common keys** preset chips (PORT, NODE_ENV, DATABASE_URL, …) — one tap opens the add row pre-filled (hidden on hosting cards; keep the panel dense)
- **View switch** (quiet underline tabs, top-right of toolbar): **Table** (default) ⇄ **Developer**
- **Table view** — bordered table, zebra rows, columns **Type · Name · Value · Build · Runtime**:
  - **Type** — read-only "Secret" checkbox on existing rows (immutable after creation; interactive only on the add row)
  - **Name** — key (mono) + optional description line + a small **Literal** flag chip (toggle on click, no separate edit mode)
  - **Value** — plaintext, or `***HIDDEN***` for secrets (write-only end to end)
  - **Build / Runtime** — live checkboxes; click toggles immediately (no Save step)
  - Key + Value + Description are the only fields that require explicit **Edit → Save/Cancel** (secret rows get **Update** instead of Edit, changing only the value)
  - **+ Add variable** opens an editable row at the top of the table with the same five columns
- **Developer view** — read-only `.env`-shaped preview (plain `Text`, never a `TextInput`, so a secret value can never be typed into or saved over): `KEY=value` per line, description as a `#` comment above, and a trailing `# secret, build, runtime, literal` flag comment; secrets always render as `***HIDDEN***`

## Copy

- Environment/project hint: “Injected into compose at deploy — lower scopes override”  
- Hosting hint: “Hostname-scoped overrides for this service. Applied at deploy after service scope…”  
- Empty hosting state: “Save hosting first to add hostname-scoped variables.”  
- Empty state mentions `${KEY}` compose references
- Developer view hint: “Read-only preview of how these keys sit in a .env file — secret values are masked and can never be revealed here.”

## Anti-patterns

- ❌ Pre-filling secret values on edit  
- ❌ Modal-only add flow (keep inline, in the table)  
- ❌ Hiding inheritance hint on project/environment panels  
- ❌ Offering hosting variables before the hosting row is persisted  
- ❌ Any editable/selectable input in the Developer `.env` view — it must stay render-only  
- ❌ Masking secrets with bullets/dots instead of the explicit `***HIDDEN***` label
