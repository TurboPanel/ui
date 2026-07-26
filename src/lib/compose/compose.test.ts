import { describe, expect, it } from 'vitest'
import {
  composeDocumentToRuntimeYaml,
  composeDocumentToYaml,
  emptyComposeDocument,
  normalizeCompose,
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

  it('setComposeEditorView keeps documentCommentBefore through save metadata', () => {
    const source = `# herpin and derpin

services:
  nginx:
    image: nginx:latest
`
    const parsed = yamlToComposeDocument(source)
    const saved = setComposeEditorView(parsed, 'editor')
    expect(saved.presentation.documentCommentBefore).toContain('herpin')
    expect(composeDocumentToYaml(saved)).toContain('# herpin and derpin\n\nservices:')
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

  it('stripComposePlacement hides placement while preserving comments', () => {
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
  })

  it('stripComposePlacement removes stale project pins', () => {
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

  it('stores editor view in presentation only, not x-turbopanel', () => {
    const source = yamlToComposeDocument(`services:
  nginx:
    image: nginx:alpine
`)
    const withView = setComposeEditorView(source, 'visual')
    expect(readComposeEditorView(withView)).toBe('visual')
    expect(withView.presentation.editorView).toBe('visual')
    expect(composeDocumentToYaml(withView)).not.toContain('x-turbopanel')

    const visible = stripComposeManagedExtension(withView)
    expect(composeDocumentToYaml(visible)).not.toContain('x-turbopanel')
    expect(readComposeEditorView(visible)).toBe('visual')

    const restored = setComposeEditorView(visible, 'editor')
    expect(readComposeEditorView(restored)).toBe('editor')
  })

  it('does not migrate legacy x-turbopanel.view into presentation', () => {
    const normalized = normalizeCompose({
      version: 1,
      data: {
        services: { nginx: { image: 'nginx:alpine' } },
        'x-turbopanel': { view: 'visual' },
      },
      presentation: { keyOrder: ['services', 'x-turbopanel'], comments: {} },
    })
    expect(normalized.presentation.editorView).toBeUndefined()
    expect(normalized.data['x-turbopanel']).toEqual({ view: 'visual' })
  })

})

describe('blank compose drafts', () => {
  it('treats services: {} as an empty draft', () => {
    const doc = yamlToComposeDocument('services: {}\n')
    expect(doc).toEqual(emptyComposeDocument())
    expect(composeDocumentToYaml(doc)).toBe('\n')
    expect(composeDocumentToRuntimeYaml(doc)).toBe('\n')
  })
})
