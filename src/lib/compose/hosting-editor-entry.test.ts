import { describe, expect, it } from 'vitest'
import {
  composeHostingEntryFromEditorFields,
  parseHostnameList,
  type ComposeHostingEditorFields,
} from './hosting-editor-entry'
import { composeDocumentToYaml, yamlToComposeDocument } from './convert'
import {
  resolveHostingServiceContext,
  writeComposeHostingEntries,
} from './hosting-service-context'
import { collectServiceKindFieldIssues } from './service-kind'
import { blockingComposeLintIssues, lintComposeYaml } from './lint'

function editor(
  overrides: Partial<ComposeHostingEditorFields> = {},
): ComposeHostingEditorFields {
  return {
    hostnames: 'App.Example.test',
    pathPrefix: '/',
    targetPort: '8080',
    forceHttps: true,
    tlsId: null,
    ipId: null,
    bind: 'local',
    ...overrides,
  }
}

describe('parseHostnameList', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseHostnameList(' a.test , , b.test ')).toEqual([
      'a.test',
      'b.test',
    ])
  })
})

describe('composeHostingEntryFromEditorFields', () => {
  it('returns null without a hostname and lowercases the first one', () => {
    expect(composeHostingEntryFromEditorFields(editor({ hostnames: '  ' }), 'container'))
      .toBeNull()
    expect(
      composeHostingEntryFromEditorFields(editor(), 'container')?.hostname,
    ).toBe('app.example.test')
  })

  it('writes only the keys that say something', () => {
    expect(composeHostingEntryFromEditorFields(editor(), 'container')).toEqual({
      hostname: 'app.example.test',
      targetPort: 8080,
      tls: { mode: 'internal' },
      bind: { scope: 'local' },
    })
  })

  it('writes the panel-authored TLS, bind, and forceHttps choices', () => {
    // `forceHttps` is only written when it is false: omitting it means `true`,
    // so writing the default out would turn every save into a diff.
    expect(
      composeHostingEntryFromEditorFields(
        editor({
          forceHttps: false,
          pathPrefix: '/app',
          tlsId: 'cert-1',
          bind: 'public',
          ipId: 'ip-1',
        }),
        'container',
      ),
    ).toEqual({
      hostname: 'app.example.test',
      pathPrefix: '/app',
      targetPort: 8080,
      forceHttps: false,
      tls: { mode: 'certificate', certificateRef: 'cert-1' },
      bind: { scope: 'public', ipRef: 'ip-1' },
    })
    // A pinned IP only means something on a public bind.
    expect(
      composeHostingEntryFromEditorFields(
        editor({ bind: 'datacenter', ipId: 'ip-1' }),
        'container',
      )?.bind,
    ).toEqual({ scope: 'datacenter' })
  })

  it('keeps an authored targetPort on a container service', () => {
    expect(
      composeHostingEntryFromEditorFields(editor(), 'container')?.targetPort,
    ).toBe(8080)
    // An omitted `serviceKind` is the compose default, which is `container`.
    expect(
      composeHostingEntryFromEditorFields(editor(), undefined)?.targetPort,
    ).toBe(8080)
  })

  it('never writes targetPort for a node service', () => {
    // The regression: the editor used to resolve every non-site service as a
    // container, so a native app was offered a Target port field and the value
    // was written into `x-turbopanel.hosting` — a document the control plane
    // then refuses on save (`targetPort is not valid on a node service`).
    const entry = composeHostingEntryFromEditorFields(editor(), 'node')
    expect(entry).not.toBeNull()
    expect(entry).not.toHaveProperty('targetPort')
    expect(Object.keys(entry ?? {})).not.toContain('targetPort')
  })

  it('never writes targetPort for a site service', () => {
    const entry = composeHostingEntryFromEditorFields(editor(), 'site')
    expect(entry).not.toHaveProperty('targetPort')
  })

  it('writes a node hosting block the compose rules accept', () => {
    // End to end through the editor's own write path: resolve the context from
    // the document (which is where `node` used to be flattened away), build the
    // entry, write it back, and prove the result lints clean.
    const document = yamlToComposeDocument(`services:
  api:
    x-turbopanel:
      serviceKind: node
      source:
        sourceId: 11111111-2222-3333-4444-555555555555
`)
    const context = resolveHostingServiceContext(document, 'api')
    expect(context.kind).toBe('node')

    const entry = composeHostingEntryFromEditorFields(editor(), context.kind)
    expect(entry).not.toBeNull()
    const next = writeComposeHostingEntries(document, 'api', [entry!])

    const services = next.data.services as Record<string, Record<string, unknown>>
    const extension = services.api['x-turbopanel'] as Record<string, unknown>
    const written = extension.hosting as Record<string, unknown>[]
    expect(written[0]).not.toHaveProperty('targetPort')
    expect(collectServiceKindFieldIssues(extension)).toEqual([])
    // Serialized, not `next.text` — the write helper edits `data` and leaves
    // the original source alone, so linting the text would lint the document
    // before the edit and prove nothing.
    expect(blockingComposeLintIssues(lintComposeYaml(composeDocumentToYaml(next))))
      .toEqual([])
  })
})
