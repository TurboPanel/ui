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

  it('reads numeric ports, long-form volumes, map networks, and build sources', () => {
    const model = buildComposeDocModel(
      yamlToComposeDocument(`services:
  web:
    image: nginx
    ports:
      - 8080
      - target: 80
      - published: 443
        target: 8443
      - {}
    volumes:
      - source: data
        target: /data
      - ""
      - source: ""
        target: /orphan
    networks:
      front:
        aliases:
          - web
    deploy:
      replicas: 1
    x-turbopanel:
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
  inline:
    build:
      context: .
      dockerfile_inline: |
        FROM alpine
  fromfile:
    build:
      context: ./api
      dockerfile: Dockerfile.prod
  healthy:
    image: redis
    depends_on: true
    ports: mapping
    volumes: mapping
volumes:
  data:
    name: custom-data
  local:
    driver: local
networks:
  front: {}
  ignored: not-a-map
`),
    )

    const web = model.services.find((service) => service.name === 'web')
    expect(web?.ports).toEqual(['8080', '80', '443:8443'])
    expect(web?.mounts).toEqual([
      { source: 'data', target: '/data', named: true },
    ])
    expect(web?.sourceBound).toBe(true)
    expect(web?.dependsOn).toEqual([])

    const inline = model.services.find((service) => service.name === 'inline')
    expect(inline?.source).toBe('inline Dockerfile')
    expect(inline?.lines).toContainEqual({
      text: 'build',
      value: 'inline Dockerfile',
      depth: 1,
    })

    const fromfile = model.services.find((service) => service.name === 'fromfile')
    expect(fromfile?.source).toBe('Dockerfile.prod')

    expect(model.volumes.map((volume) => [volume.name, volume.detail])).toEqual([
      ['data', 'custom-data'],
      ['local', 'local'],
    ])
    expect(model.networks[0]).toEqual({
      name: 'front',
      usedBy: ['web'],
      detail: null,
    })
  })

  it('formats boolean and numeric scalars on long-syntax ports', () => {
    const model = buildComposeDocModel({
      version: 1,
      data: {
        services: {
          web: {
            image: 'nginx',
            ports: [
              { published: true, target: 80 },
              { published: 0, target: false },
            ],
          },
        },
      },
      presentation: { keyOrder: ['services'], comments: {} },
    })
    expect(model.services[0]?.ports).toEqual(['true:80', '0:false'])
  })

  it('ignores volume entries that are neither strings nor maps', () => {
    const model = buildComposeDocModel({
      version: 1,
      data: {
        services: {
          web: {
            image: 'nginx',
            volumes: [
              1,
              true,
              null,
              [],
              'data:',
              { source: 'data' },
              { source: './bind', target: '/srv' },
              { target: '/orphan' },
              { source: 1, target: 2 },
            ],
            ports: [{ target: ':' }, { published: 443 }],
            depends_on: ['api', 1],
            networks: ['front', 2],
          },
        },
        volumes: {
          data: { name: '', driver: '' },
          other: { external: false },
        },
        networks: {
          front: { name: '', driver: '' },
        },
      },
      presentation: { keyOrder: ['services', 'volumes', 'networks'], comments: {} },
    })
    expect(model.services[0]?.mounts).toEqual([
      { source: 'data', target: null, named: true },
      { source: 'data', target: null, named: true },
      { source: './bind', target: '/srv', named: false },
    ])
    expect(model.services[0]?.ports).toEqual(['443:'])
    expect(model.services[0]?.dependsOn).toEqual(['api'])
    expect(model.volumes.map((volume) => volume.detail)).toEqual([null, null])
    expect(model.networks[0]).toEqual({
      name: 'front',
      usedBy: ['web'],
      detail: null,
    })
  })

  it('drops empty volume sources and reports a service with no image or build', () => {
    const model = buildComposeDocModel(
      yamlToComposeDocument(`services:
  web:
    environment:
      A: "1"
    volumes:
      - ":"
      - ""
  other: not-a-map
volumes: not-a-map
`),
    )
    expect(model.services[0]?.source).toBeNull()
    expect(model.services[0]?.mounts).toEqual([])
    expect(model.services[1]?.name).toBe('other')
    expect(model.volumes).toEqual([])
  })
})
