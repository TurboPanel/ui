# Third-party OS artwork

The files in this directory are **not** licensed under TurboPanel's
AGPL-3.0-only, and they are **not** covered by the Apple App Store additional
permission in `LICENSES/TurboPanel-Apple-App-Store-Additional-Permission.txt`.
That permission applies only to material TurboPanel has authority to license
and must never be treated as an exception to a third party's license or
trademark terms.

Do not add a mark without a NOTICE.md entry. Record provenance **before**
running `pnpm os-logos`.

## debian (`src/debian.svg` → `debian.png`, `@2x`, `@3x`)

- **Mark:** Debian Open Use Logo, without the “Debian” wordmark (swirl only).
- **Source:** [Debian logos](https://www.debian.org/logos/) (`openlogo-nd.svg`).
- **Copyright holder:** Software in the Public Interest, Inc. Copyright (c) 1999.
- **Artwork license (chosen option):** [GNU Lesser General Public License, version 3 or any later version](https://www.gnu.org/licenses/lgpl-3.0.html). Debian also offers [CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/) as an alternative; this tree relies on **LGPL-3.0-or-later**.
- **Trademark:** “Debian” and the swirl logo are trademarks of Software in the Public Interest, Inc. Use here is nominative identification of a host operating system under the [Debian Trademark Policy](https://www.debian.org/trademark.html) (version 2.0). This is not Debian branding for TurboPanel, does not imply endorsement, and the mark is not used as part of the TurboPanel product logo. Scaling retains original proportions (object-fit contain onto the 18×24 CSS-pixel canvas).

## raspberry-pi-os

Not shipped. The control plane may still send `osLogo: "raspberry-pi-os"`; the
UI renders the product name as plain text. Raspberry Pi trademarks are not
licensed for this use.
