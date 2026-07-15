import { describe, expect, it } from 'vitest'
import {
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  preserveComposePlacement,
  stripComposePlacement,
  yamlToComposeDocument,
} from './index'

describe('compose comment round-trip', () => {
  it('keeps nested map comments before a service key', () => {
    const source = `services:
  # comment
  nginx:
    image: nginx:alpine
`
    const roundTrip = composeDocumentToYaml(yamlToComposeDocument(source))
    expect(roundTrip).toContain('# comment')
    expect(roundTrip.indexOf('# comment')).toBeGreaterThan(roundTrip.indexOf('services:'))
    expect(roundTrip.indexOf('# comment')).toBeLessThan(roundTrip.indexOf('nginx:'))
    expect(roundTrip.trimStart().startsWith('services:')).toBe(true)
  })

  it('keeps leading document comments separated by a blank line', () => {
    const source = `# test

services:
  nginx:
    image: nginx # herpin and derpin 2
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentCommentBefore).toContain('test')
    expect(doc.presentation.comments.services?.keyBefore).toBeUndefined()

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip.startsWith('# test\n')).toBe(true)
    expect(roundTrip).toContain('# test\n\nservices:')
    expect(roundTrip).toContain('image: nginx # herpin and derpin 2')
  })

  it('keeps leading comments glued to the first key when there is no blank line', () => {
    const source = `# test
services:
  nginx:
    image: nginx
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentCommentBefore).toBeUndefined()
    expect(doc.presentation.comments.services?.keyBefore).toContain('test')

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# test')
    expect(roundTrip.indexOf('# test')).toBeLessThan(roundTrip.indexOf('services:'))
  })

  it('keeps trailing document comments', () => {
    const source = `services:
  nginx:
    image: nginx
# trailing
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.documentComment).toContain('trailing')
    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# trailing')
  })

  it('keeps trailing scalar comments', () => {
    const source = `services:
  nginx:
    image: nginx:alpine # line comment
`
    const roundTrip = composeDocumentToYaml(yamlToComposeDocument(source))
    expect(roundTrip).toContain('image: nginx:alpine # line comment')
  })

  it('keeps sequence-item trailing comments regardless of spacing before #', () => {
    const source = `services:
  uptime-kuma:
    image: louislam/uptime-kuma:2
    ports:
      - "3001:3001"  # This maps the container port
    volumes:
      - /path/to/data:/app/data  # Configuring persistent storage
    environment:
      - TZ=UTC  # Set the timezone
`
    const doc = yamlToComposeDocument(source)
    expect(doc.presentation.comments['services.uptime-kuma.ports[0]']?.inline)
      .toContain('This maps the container port')
    expect(doc.presentation.comments['services.uptime-kuma.volumes[0]']?.inline)
      .toContain('Configuring persistent storage')
    expect(doc.presentation.comments['services.uptime-kuma.environment[0]']?.inline)
      .toContain('Set the timezone')

    const roundTrip = composeDocumentToYaml(doc)
    expect(roundTrip).toContain('# This maps the container port')
    expect(roundTrip).toContain('# Configuring persistent storage')
    expect(roundTrip).toContain('# Set the timezone')
  })

  it('user strip hides placement while preserve restores it on save', () => {
    const source = yamlToComposeDocument(`services:
  # comment
  nginx:
    image: nginx:alpine # line comment
x-turbopanel:
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
`)
    const user = stripComposePlacement(source)
    const userYaml = composeDocumentToYaml(user)
    expect(userYaml).not.toContain('x-turbopanel')
    expect(userYaml).toContain('# comment')
    expect(userYaml).toContain('# line comment')

    const saved = preserveComposePlacement(yamlToComposeDocument(userYaml), source)
    expect(composeDocumentToYaml(saved)).toContain('x-turbopanel')
    expect(composeDocumentToYaml(saved)).toContain('# comment')
    expect(composeDocumentToRuntimeYaml(saved)).not.toContain('# comment')
    expect(composeDocumentToRuntimeYaml(saved)).toContain('x-turbopanel')
  })
})
