import { describe, expect, it } from 'vitest'
import { buildComposeDocModel } from '@/lib/compose/document-model'
import { yamlToComposeDocument } from '@/lib/compose/convert'

const doc = yamlToComposeDocument(`services:
  web:
    image: nginx:1.27
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - data:/var/www
      - ./local:/srv
      - anon
    depends_on:
      - api
    networks:
      - front
    environment:
      A: "1"
    labels:
      - x=y
    x-turbopanel:
      placement: ignored
  api:
    build:
      context: ./api
    depends_on:
      db:
        condition: service_healthy
    ports:
      - published: 3000
        target: 3000
  db:
    image: postgres:18
volumes:
  data: {}
  backups:
    external: true
networks:
  front:
    driver: bridge
`)

describe('buildComposeDocModel', () => {
  it('keeps definition order and reads each service source', () => {
    const model = buildComposeDocModel(doc)
    expect(model.services.map((s) => s.name)).toEqual(['web', 'api', 'db'])
    expect(model.services[0]!.source).toBe('nginx:1.27')
    // No image: fall back to the build location.
    expect(model.services[1]!.source).toBe('./api')
    expect(model.isEmpty).toBe(false)
  })

  it('normalizes ports from strings and long form', () => {
    const model = buildComposeDocModel(doc)
    expect(model.services[0]!.ports).toEqual(['80:80', '443:443'])
    expect(model.services[1]!.ports).toEqual(['3000:3000'])
  })

  it('flags named volumes and keeps bind mounts and anonymous entries', () => {
    const [web] = buildComposeDocModel(doc).services
    expect(web!.mounts).toEqual([
      { source: 'data', target: '/var/www', named: true },
      { source: './local', target: '/srv', named: false },
      { source: 'anon', target: null, named: false },
    ])
  })

  it('reads depends_on from a list and from a condition map', () => {
    const model = buildComposeDocModel(doc)
    expect(model.services[0]!.dependsOn).toEqual(['api'])
    expect(model.services[1]!.dependsOn).toEqual(['db'])
  })

  it('counts unpromoted keys and ignores our own x- extension', () => {
    const [web, , db] = buildComposeDocModel(doc).services
    // environment + labels; networks is not promoted either.
    expect(web!.otherKeyCount).toBe(3)
    expect(db!.otherKeyCount).toBe(0)
  })

  it('renders YAML-shaped lines with list items indented under their key', () => {
    const [web] = buildComposeDocModel(doc).services
    expect(web!.lines).toEqual([
      { text: 'image', value: 'nginx:1.27', depth: 1 },
      { text: 'ports', depth: 1 },
      { text: '80:80', depth: 2, listItem: true },
      { text: '443:443', depth: 2, listItem: true },
      { text: 'volumes', depth: 1 },
      { text: 'data:/var/www', depth: 2, listItem: true },
      { text: './local:/srv', depth: 2, listItem: true },
      { text: 'anon', depth: 2, listItem: true },
      { text: 'depends_on', depth: 1 },
      { text: 'api', depth: 2, listItem: true },
    ])
  })

  it('back-links volumes and networks to the services using them', () => {
    const model = buildComposeDocModel(doc)
    expect(model.volumes.map((v) => [v.name, v.usedBy, v.detail])).toEqual([
      ['data', ['web'], null],
      ['backups', [], 'external'],
    ])
    expect(model.networks[0]).toEqual({
      name: 'front',
      usedBy: ['web'],
      detail: 'bridge',
    })
  })

  it('reports an empty document rather than throwing on junk', () => {
    expect(buildComposeDocModel(null).isEmpty).toBe(true)
    expect(buildComposeDocModel({ nope: true }).isEmpty).toBe(true)
    expect(buildComposeDocModel(yamlToComposeDocument('')).services).toEqual([])
  })
})
