import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html'
import type { PropsWithChildren } from 'react'
import { themeCss } from '@/lib/theme-palettes'

/**
 * Root HTML for the static web export. Same head as Expo's default, plus the
 * theme: the stylesheet that defines every `--tp-*` colour variable (Navy,
 * Paper, and "follow the device"), and a tiny script (`public/theme-boot.js`,
 * a file rather than inline code so the page's script policy stays as it is)
 * that applies a saved Light / Dark choice before the first paint, so the page
 * never flashes the wrong theme. A second file, `public/stale-bundle-recover.js`,
 * reloads the page once if a built script fails to load after a web update.
 *
 * Since SDK 58 the router hands the page's own scripts, styles and hydration
 * flag to the document as React nodes (`useServerDocumentContext`); a root that
 * does not render `headNodes` and `bodyNodes` exports a page with no app script.
 */
/**
 * The two reads every page starts with. The export is always served by the
 * control plane itself (the API is same-origin there), so the browser can start
 * them while it still downloads the app script. `use-credentials` is the
 * `credentials: 'include'` the app's own requests use, so each answer is used
 * once instead of fetched twice. Not emitted for the dev server, where the
 * API lives on another origin.
 */
const PRELOAD_API_PATHS = ['/api/client/v1/status', '/api/client/v1/authn/session'] as const

export default function Root({ children }: Readonly<PropsWithChildren>) {
  const { bodyAttributes, bodyNodes, headNodes, htmlAttributes } = useServerDocumentContext()
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style id="tp-theme" dangerouslySetInnerHTML={{ __html: themeCss() }} />
        {process.env.NODE_ENV === 'production'
          ? PRELOAD_API_PATHS.map((href) => (
              <link key={href} rel="preload" as="fetch" href={href} crossOrigin="use-credentials" />
            ))
          : null}
        <script src="/theme-boot.js" />
        <script src="/stale-bundle-recover.js" />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  )
}
