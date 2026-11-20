import { describe, expect, it } from 'vitest'
import { composeDocumentToYaml, yamlToComposeDocument } from './convert'
import { blockingComposeLintIssues } from './lint'
import { environmentBaseLayers, lintEnvironmentLayer } from './layer-lint'

const BASE = yamlToComposeDocument(`services:
  vpn:
    build:
      context: ./vpn
    ports:
      - "1194:1194"
  qbittorrent:
    build:
      context: ./qbit
    volumes:
      - data:/data
  web:
    image: nginx:alpine
`)

function lint(layerYaml: string, base: unknown, overlays: unknown[] = [], after: unknown[] = []) {
  const layer = yamlToComposeDocument(layerYaml)
  return lintEnvironmentLayer(composeDocumentToYaml(layer), layer, {
    before: [base, ...overlays],
    after,
  })
}

describe('lintEnvironmentLayer', () => {
  it('lets a service take its image or build from the Base', () => {
    const issues = lint(
      `services:
  vpn:
    environment:
      MODE: prod
    ports: !reset []
  qbittorrent:
    volumes:
      - media:/media
`,
      BASE
    )
    expect(blockingComposeLintIssues(issues)).toEqual([])
  })

  it('still refuses a service neither the Base nor the changes give an image or build', () => {
    const issues = blockingComposeLintIssues(
      lint(
        `services:
  worker:
    environment:
      MODE: prod
`,
        BASE
      )
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toBe(
      `Service "worker" must define "image" or "build" - neither the project's Base nor this environment's changes give it one`
    )
  })

  it('accepts a new service that names its own image', () => {
    const issues = lint(`services:\n  cache:\n    image: redis:7\n`, null)
    expect(blockingComposeLintIssues(issues)).toEqual([])
  })

  it('refuses a layer with no Base and no image', () => {
    const issues = blockingComposeLintIssues(
      lint(`services:\n  cache:\n    restart: always\n`, null)
    )
    expect(issues.map((i) => i.code)).toEqual(['service_missing_image_or_build'])
  })

  it('returns no issues for empty changes', () => {
    expect(lintEnvironmentLayer('', null, { before: [BASE], after: [] })).toEqual([])
  })

  it('refuses a service whose image is reset and has no build', () => {
    const issues = blockingComposeLintIssues(
      lint(`services:\n  web:\n    image: !reset null\n`, BASE)
    )
    expect(issues.map((i) => i.code)).toEqual(['service_missing_image_or_build'])
  })

  it('refuses a service-level override that drops the Base build', () => {
    const issues = blockingComposeLintIssues(
      lint(`services:\n  vpn: !override\n    environment:\n      MODE: prod\n`, BASE)
    )
    expect(issues.map((i) => i.code)).toEqual(['service_missing_image_or_build'])
  })

  it('reports an unparseable layer without merging it', () => {
    const issues = lintEnvironmentLayer('services:\n  vpn: [\n', null, {
      before: [BASE],
      after: [],
    })
    expect(blockingComposeLintIssues(issues).length).toBeGreaterThan(0)
    expect(issues.some((i) => i.code === 'service_missing_image_or_build')).toBe(false)
  })

  it('counts a build that only a project overlay file gives the service', () => {
    const projectOverlay = yamlToComposeDocument(
      'services:\n  worker:\n    build:\n      context: ./worker\n'
    )
    const layer = `services:\n  worker:\n    environment:\n      MODE: prod\n`
    expect(blockingComposeLintIssues(lint(layer, BASE, [projectOverlay]))).toEqual([])
    expect(blockingComposeLintIssues(lint(layer, BASE))).toHaveLength(1)
  })

  it('counts an image that only an environment overlay file gives the service', () => {
    const envOverlay = yamlToComposeDocument('services:\n  worker:\n    image: busybox\n')
    const layer = `services:\n  worker:\n    environment:\n      MODE: prod\n`
    expect(blockingComposeLintIssues(lint(layer, BASE, [], [envOverlay]))).toEqual([])
  })

  it('blocks the save with a plain note while the Base is loading', () => {
    const layer = yamlToComposeDocument(`services:\n  vpn:\n    environment:\n      A: b\n`)
    const issues = blockingComposeLintIssues(
      lintEnvironmentLayer(composeDocumentToYaml(layer), layer, null)
    )
    expect(issues.map((i) => i.message)).toEqual(["Waiting for the project's Base to load"])
  })

  it('collects the project and environment overlay files around the changes', () => {
    const layers = environmentBaseLayers(
      { compose: BASE, composeOverlays: [{ id: 'a', filename: 'a.yml', document: 1 }] },
      { composeOverlays: [{ id: 'b', filename: 'b.yml', document: 2 }, 'junk'] }
    )
    expect(layers.before).toEqual([BASE, 1])
    expect(layers.after).toEqual([2])
  })

  it('keeps the value of a !reset in the Base, as the control plane does', () => {
    const base = yamlToComposeDocument(
      'services:\n  vpn:\n    image: !reset busybox\n    environment:\n      A: b\n'
    )
    const layer = yamlToComposeDocument('services:\n  vpn:\n    environment:\n      C: d\n')
    const issues = lintEnvironmentLayer(composeDocumentToYaml(layer), layer, {
      before: [base],
      after: [],
    })
    expect(blockingComposeLintIssues(issues)).toEqual([])
  })

  it('reads overlay files like the control plane does', () => {
    const entry = (n: number) => ({ id: `o${n}`, filename: `o${n}.yml`, document: n })
    const many = Array.from({ length: 10 }, (_, n) => entry(n))
    const layers = environmentBaseLayers(
      { composeOverlays: [{ id: 1, filename: 'x.yml', document: 9 }, ...many] },
      null
    )
    expect(layers.before).toEqual([null, 0, 1, 2, 3, 4, 5, 6])
  })

  it('blocks the save with the reason when the Base failed to load', () => {
    const layer = yamlToComposeDocument('services:\n  vpn:\n    environment:\n      A: b\n')
    const issues = blockingComposeLintIssues(
      lintEnvironmentLayer(composeDocumentToYaml(layer), layer, { error: 'timeout' })
    )
    expect(issues.map((i) => i.message)).toEqual([
      "Couldn't load the project's Base: timeout. Reload to try again.",
    ])
  })
})
