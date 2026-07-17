import { describe, expect, it } from 'vitest'
import {
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  preserveComposePlacement,
  readComposeEditorView,
  setComposeEditorView,
  stripComposeManagedExtension,
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

  it('stripComposePlacement removes stale project pins without preserve', () => {
    const projectPin = '11111111-1111-4111-8111-111111111111'
    const source = yamlToComposeDocument(`services:
  nginx:
    image: nginx:alpine
x-turbopanel:
  placement:
    server_id: ${projectPin}
`)
    const stripped = stripComposePlacement(source)
    expect(composeDocumentToYaml(stripped)).not.toContain('x-turbopanel')
    expect(composeDocumentToRuntimeYaml(stripped)).not.toContain(projectPin)
  })

  it('environment overlay placement survives strip/preserve round-trip', () => {
    const envPin = '22222222-2222-4222-8222-222222222222'
    const overlay = yamlToComposeDocument(`services: {}
x-turbopanel:
  placement:
    server_id: ${envPin}
`)
    const edited = yamlToComposeDocument(`services:
  api:
    image: node:22
`)
    const saved = preserveComposePlacement(edited, overlay)
    expect(composeDocumentToRuntimeYaml(saved)).toContain(envPin)
    expect(composeDocumentToYaml(stripComposePlacement(saved))).not.toContain(
      'x-turbopanel',
    )
  })

  it('stores editor view under x-turbopanel and hides it from the YAML editor', () => {
    const source = yamlToComposeDocument(`services:
  nginx:
    image: nginx:alpine
`)
    const withView = setComposeEditorView(source, 'visual')
    expect(readComposeEditorView(withView)).toBe('visual')
    expect(composeDocumentToYaml(withView)).toContain('view: visual')

    const visible = stripComposeManagedExtension(withView)
    expect(composeDocumentToYaml(visible)).not.toContain('x-turbopanel')
    expect(readComposeEditorView(visible)).toBeNull()

    const restored = setComposeEditorView(visible, 'visual')
    expect(readComposeEditorView(restored)).toBe('visual')
  })

  it('preserves editor view when setting placement', () => {
    const envPin = '22222222-2222-4222-8222-222222222222'
    const withView = setComposeEditorView(
      yamlToComposeDocument(`services:
  api:
    image: node:22
`),
      'visual',
    )
    const withPlacement = preserveComposePlacement(
      withView,
      yamlToComposeDocument(`services: {}
x-turbopanel:
  placement:
    server_id: ${envPin}
`),
    )
    expect(readComposeEditorView(withPlacement)).toBe('visual')
    expect(composeDocumentToRuntimeYaml(withPlacement)).toContain(envPin)
    expect(
      composeDocumentToYaml(stripComposeManagedExtension(withPlacement)),
    ).not.toContain('x-turbopanel')
  })
})
