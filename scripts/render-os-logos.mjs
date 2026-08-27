#!/usr/bin/env node
/**
 * Rasterize OS logo SVGs under assets/os/src/ into density-aware PNGs.
 *
 * Expo / React Native resolve `foo.png` + `wendy.h@example.net` + `foo@3x.png`
 * from a single `require('./foo.png')`, so retina / HiDPI / iPhone stay sharp.
 *
 * Usage:
 *   pnpm os-logos
 *
 * Adding a logo:
 *   1. Drop a transparent SVG into assets/os/src/<slug>.svg
 *   2. Record provenance in assets/os/NOTICE.md (required before this script)
 *   3. Run `pnpm os-logos`
 *   4. Map the slug in src/lib/os-logos.ts (and ServerOsLogoKey if needed)
 *
 * This script rasterizes every SVG in assets/os/src/ and prunes generated PNGs
 * whose slug no longer has a source SVG — removing the SVG is what removes
 * the PNGs.
 */

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC_DIR = join(ROOT, 'assets/os/src')
const OUT_DIR = join(ROOT, 'assets/os')

/** Logical CSS pixels for the servers-table mark (style width × height). */
const LOGICAL_WIDTH = 18
const LOGICAL_HEIGHT = 24
const SCALES = [1, 2, 3]

const VIEW_BOX_RE = /viewBox\s*=\s*["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i
const WIDTH_HEIGHT_RE =
  /<svg\b[^>]*\bwidth\s*=\s*["']([\d.]+)(?:px)?["'][^>]*\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i
const HEIGHT_WIDTH_RE =
  /<svg\b[^>]*\bheight\s*=\s*["']([\d.]+)(?:px)?["'][^>]*\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i

/**
 * @param {string} svg
 * @returns {{ width: number, height: number }}
 */
function readSvgSize(svg) {
  const viewBox = VIEW_BOX_RE.exec(svg)
  if (viewBox) {
    return {
      width: Number(viewBox[3]),
      height: Number(viewBox[4]),
    }
  }
  const wh = WIDTH_HEIGHT_RE.exec(svg)
  if (wh) {
    return { width: Number(wh[1]), height: Number(wh[2]) }
  }
  const hw = HEIGHT_WIDTH_RE.exec(svg)
  if (hw) {
    return { width: Number(hw[2]), height: Number(hw[1]) }
  }
  throw new TypeError('SVG is missing viewBox and width/height')
}

/**
 * Strip the outer <svg> wrapper so we can nest the mark inside a fixed canvas.
 * @param {string} svg
 */
function innerSvgMarkup(svg) {
  const trimmed = svg.trim()
  const openEnd = trimmed.indexOf('>')
  if (openEnd === -1 || !trimmed.startsWith('<svg')) {
    throw new TypeError('Expected an <svg> root element')
  }
  if (!trimmed.endsWith('</svg>')) {
    throw new TypeError('Expected a closing </svg>')
  }
  return trimmed.slice(openEnd + 1, -'</svg>'.length).trim()
}

/**
 * Build a transparent canvas SVG with the mark centered (object-fit: contain).
 * @param {string} sourceSvg
 * @param {number} canvasW
 * @param {number} canvasH
 */
function wrapInCanvas(sourceSvg, canvasW, canvasH) {
  const { width: srcW, height: srcH } = readSvgSize(sourceSvg)
  if (!(srcW > 0 && srcH > 0)) {
    throw new TypeError('SVG size must be positive')
  }
  const scale = Math.min(canvasW / srcW, canvasH / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale
  const x = (canvasW - drawW) / 2
  const y = (canvasH - drawH) / 2
  const inner = innerSvgMarkup(sourceSvg)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}">
  <svg x="${x}" y="${y}" width="${drawW}" height="${drawH}" viewBox="0 0 ${srcW} ${srcH}" preserveAspectRatio="xMidYMid meet">
    ${inner}
  </svg>
</svg>
`
}

/**
 * @param {string} slug
 * @param {number} scale
 */
function outName(slug, scale) {
  if (scale === 1) return `${slug}.png`
  return `${slug}@${scale}x.png`
}

function listSourceSvgs() {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.svg'))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function pngSlug(name) {
  if (!name.endsWith('.png')) return null
  const withoutExt = name.slice(0, -'.png'.length)
  for (const scale of SCALES) {
    if (scale === 1) continue
    const suffix = `@${scale}x`
    if (withoutExt.endsWith(suffix)) {
      return withoutExt.slice(0, -suffix.length)
    }
  }
  return withoutExt
}

/**
 * @param {Set<string>} keepSlugs
 */
function pruneStalePngs(keepSlugs) {
  for (const name of readdirSync(OUT_DIR)) {
    const slug = pngSlug(name)
    if (!slug || keepSlugs.has(slug)) continue
    const stalePath = join(OUT_DIR, name)
    unlinkSync(stalePath)
    console.log(`removed ${stalePath}`)
  }
}

function renderAll() {
  mkdirSync(OUT_DIR, { recursive: true })
  const sources = listSourceSvgs()
  if (sources.length === 0) {
    throw new TypeError(`No SVGs found in ${SRC_DIR}`)
  }

  const keepSlugs = new Set(sources.map((file) => basename(file, '.svg')))

  for (const file of sources) {
    const slug = basename(file, '.svg')
    const sourceSvg = readFileSync(join(SRC_DIR, file), 'utf8')
    for (const scale of SCALES) {
      const canvasW = LOGICAL_WIDTH * scale
      const canvasH = LOGICAL_HEIGHT * scale
      const wrapped = wrapInCanvas(sourceSvg, canvasW, canvasH)
      const resvg = new Resvg(wrapped, {
        fitTo: { mode: 'width', value: canvasW },
        background: 'rgba(0,0,0,0)',
      })
      const png = resvg.render().asPng()
      const outPath = join(OUT_DIR, outName(slug, scale))
      writeFileSync(outPath, png)
      console.log(`wrote ${outPath} (${canvasW}×${canvasH})`)
    }
  }

  pruneStalePngs(keepSlugs)
}

renderAll()
