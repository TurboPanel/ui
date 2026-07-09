import type { ServerOsLogoKey } from '@/lib/instance-api'

/** Inline SVG data URIs — reliable on Expo web + native without an SVG transformer. */
const DEBIAN_LOGO_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#A80030"/><path fill="#fff" d="M36.8 14.2c-2.4-.7-5-.7-7.5.2-4.2 1.5-7.4 5-8.4 9.3-.5 2.1-.4 4.3.3 6.3.8 2.3 2.3 4.3 4.3 5.7 1.5 1.1 3.3 1.8 5.1 2 .9.1 1.8 0 2.6-.3.7-.3 1.2-.9 1.3-1.6.1-.8-.3-1.6-1-2-.6-.3-1.3-.4-2-.3-1.2.2-2.3-.1-3.2-.8-1.1-.8-1.8-2.1-1.9-3.5-.1-1.5.4-3 1.5-4.1 1.2-1.2 2.9-1.8 4.6-1.6 1.5.2 2.9 1 3.8 2.2.7 1 1 2.2.8 3.4-.1.7.3 1.4 1 1.6.7.2 1.4-.2 1.6-.9.4-2.1-.1-4.2-1.3-5.9-1.5-2.1-3.9-3.5-6.5-3.8-3.1-.4-6.2.8-8.2 3.2-1.9 2.2-2.7 5.2-2.2 8 .5 2.8 2.2 5.3 4.6 6.8 2.1 1.3 4.6 1.8 7 1.4 1.1-.2 2.1.5 2.3 1.5.2 1.1-.5 2.1-1.5 2.3-3.2.6-6.5 0-9.2-1.7-3.3-2.1-5.6-5.5-6.2-9.3-.7-3.8.3-7.7 2.7-10.7 2.7-3.4 6.9-5.2 11.1-4.9 2.7.2 5.3 1.2 7.3 3 2.1 1.8 3.4 4.4 3.6 7.2.1 1.1-.7 2.1-1.8 2.2-1.1.1-2.1-.7-2.2-1.8-.1-1.7-.9-3.3-2.2-4.4-1.4-1.2-3.2-1.8-5-1.6z"/></svg>`,
  )

const RASPBERRY_PI_LOGO_URI =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="30" fill="#C51A4A"/><g fill="#6CC04A"><ellipse cx="24" cy="22" rx="5.5" ry="8" transform="rotate(-25 24 22)"/><ellipse cx="40" cy="22" rx="5.5" ry="8" transform="rotate(25 40 22)"/><ellipse cx="18" cy="32" rx="5" ry="7.5" transform="rotate(-55 18 32)"/><ellipse cx="46" cy="32" rx="5" ry="7.5" transform="rotate(55 46 32)"/><ellipse cx="23" cy="42" rx="4.5" ry="7" transform="rotate(-20 23 42)"/><ellipse cx="41" cy="42" rx="4.5" ry="7" transform="rotate(20 41 42)"/></g><ellipse cx="32" cy="34" rx="9" ry="10" fill="#C51A4A"/><circle cx="28.5" cy="32" r="1.6" fill="#fff"/><circle cx="35.5" cy="32" r="1.6" fill="#fff"/></svg>`,
  )

export function osLogoUri(logo: ServerOsLogoKey | null | undefined): string | null {
  if (logo === 'debian') return DEBIAN_LOGO_URI
  if (logo === 'raspberry-pi-os') return RASPBERRY_PI_LOGO_URI
  return null
}
