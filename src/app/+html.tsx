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
