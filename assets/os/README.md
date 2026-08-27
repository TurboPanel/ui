# OS logos

Source marks live in **`src/*.svg`** (brand colors, transparent background).
Committed PNGs next to this README are density variants for Expo / React Native:

| File | Scale | Typical displays |
| --- | --- | --- |
| `<slug>.png` | 1× | non-retina |
| `<slug>@2x.png` | 2× | most retina / HiDPI |
| `<slug>@3x.png` | 3× | iPhone / high-DPI phones |

Logical size is **18×24** CSS pixels (see `scripts/render-os-logos.mjs` and
`OsIdentityMark` in the servers table). Metro picks the right file from a
single `require('@/assets/os/<slug>.png')`.

Provenance and licensing for each retained mark: **[`NOTICE.md`](./NOTICE.md)**.
This artwork is not licensed under TurboPanel's AGPL and is not covered by the
Apple App Store additional permission.

## Add or refresh a logo

1. Put a clean SVG in `src/<slug>.svg` (keep the viewBox; no opaque page fill).
2. **Record provenance in [`NOTICE.md`](./NOTICE.md)** — source, copyright
   holder, the specific license relied upon for the artwork, and the applicable
   trademark policy. This step is required **before** `pnpm os-logos`. Do not
   ship a mark that cannot be documented there.
3. Run `pnpm os-logos` from the UI repo root.
4. Wire `<slug>` in `src/lib/os-logos.ts` and extend `ServerOsLogoKey` if the
   instance sends a new `osLogo` value.

`scripts/render-os-logos.mjs` rasterizes **every** SVG in `assets/os/src/` and
prunes generated PNGs whose slug no longer has a source SVG. Removing the SVG
(then re-running `pnpm os-logos`) is what removes the PNGs. Do not hand-edit
the generated PNGs.
