import { describe, expect, it } from 'vitest'
import { composeDocumentToYaml, yamlToComposeDocument } from './convert'
import { blockingComposeLintIssues } from './lint'
import { lintEnvironmentLayer } from './layer-lint'

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

function lint(layerYaml: string, base: unknown) {
  const layer = yamlToComposeDocument(layerYaml)
  return lintEnvironmentLayer(composeDocumentToYaml(layer), layer, base)
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
    expect(lintEnvironmentLayer('', null, BASE)).toEqual([])
  })
})
