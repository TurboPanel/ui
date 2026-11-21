import { describe, expect, it, vi } from 'vitest'
import type { TlsRecord } from '@/lib/instance-api'
import { CONTROL_PLANE_UNREACHABLE_COPY } from '@/lib/user-error'
import {
  type ConfiguredHostingState,
  certificateChoiceText,
  certificateLabel,
  composeEntryCertificateText,
  composeEntryConfigSnippet,
  composeEntrySummaryLines,
  composeEntryWwwText,
  composeRouteSourceText,
  COMPOSE_AUTOMATIC_CERTIFICATE_NOTE,
  COMPOSE_CERTIFICATE_HINT,
  COMPOSE_OWNED_CERTIFICATE_NOTE,
  DEPLOY_RUNNING_MESSAGE,
  HOSTING_ACTION_FAILED_MESSAGE,
  hostingActionErrorMessage,
  hostingSaveErrorMessage,
  HOSTNAME_IN_USE_MESSAGE,
  hostnameReleasedMessage,
  releaseHostnameNow,
  REMOVE_NOW_DEPLOY_RUNNING_MESSAGE,
  removeNowErrorMessage,
  COMPOSE_HOSTNAME_HINT,
  COMPOSE_PROXY_NOTE,
  EMPTY_COMPOSE_HOSTNAME_MESSAGE,
  LETS_ENCRYPT_CHOICE_TEXT,
  manageHereInsteadPrompt,
  missingCertificateMessage,
  NEW_HOSTING_CERTIFICATE_HINT,
  PENDING_REMOVAL_CERTIFICATE_HINT,
  pendingRemovalNote,
  removeHostnamePrompt,
  resolveCertificateRef,
  SELF_SIGNED_CHOICE_TEXT,
  SERVICE_NOT_SAVED_MESSAGE,
  SHARED_FILE_HOSTNAME_MESSAGE,
} from './hosting-plain-words'

function certificate(id: string, name: string | null, dnsNames: string[] = []): TlsRecord {
  return {
    id,
    organizationId: 'org',
    name,
    source: 'upload',
    metadata: { dnsNames } as TlsRecord['metadata'],
    createdAt: '',
    updatedAt: '',
  }
}

const library = [
  certificate('11111111-aaaa', 'Shop wildcard'),
  certificate('22222222-bbbb', null, ['example.test']),
]

const STATES: ConfiguredHostingState[] = ['not-deployed', 'deployed', 'adopted', 'held-by-panel']

const RAW_REFUSALS = [
  '/api/client/v1/hostings/abc/release-from-compose failed: HTTP 409: environment_deploy_running — A deploy is running.',
  '/api/client/v1/hostings failed: HTTP 409: hostname_in_use',
  '/api/client/v1/environments/abc failed: HTTP 500: Internal Server Error',
]

/** Every sentence the screen shows: no raw configuration word may reach a person. */
const RAW_WORDS =
  /\/api\/|HTTP \d{3}|_in_use|_running|tls\.mode|certificateRef|x-turbopanel|"internal"|"certificate"|"automatic"/

describe('plain hosting words', () => {
  it('never shows a raw configuration word in a sentence', () => {
    const sentences = [
      COMPOSE_AUTOMATIC_CERTIFICATE_NOTE,
      COMPOSE_CERTIFICATE_HINT,
      COMPOSE_OWNED_CERTIFICATE_NOTE,
      COMPOSE_HOSTNAME_HINT,
      COMPOSE_PROXY_NOTE,
      EMPTY_COMPOSE_HOSTNAME_MESSAGE,
      SHARED_FILE_HOSTNAME_MESSAGE,
      composeRouteSourceText(true),
      composeRouteSourceText(false),
      COMPOSE_OWNED_CERTIFICATE_NOTE,
      COMPOSE_AUTOMATIC_CERTIFICATE_NOTE,
      SERVICE_NOT_SAVED_MESSAGE,
      missingCertificateMessage('Shop wildcard'),
      DEPLOY_RUNNING_MESSAGE,
      HOSTNAME_IN_USE_MESSAGE,
      HOSTING_ACTION_FAILED_MESSAGE,
      ...RAW_REFUSALS.map((refusal) => hostingActionErrorMessage(refusal)),
      pendingRemovalNote(true),
      pendingRemovalNote(false),
      NEW_HOSTING_CERTIFICATE_HINT,
      PENDING_REMOVAL_CERTIFICATE_HINT,
      ...STATES.flatMap((state) => [
        removeHostnamePrompt('example.test', state),
        manageHereInsteadPrompt('example.test', state),
      ]),
      ...composeEntrySummaryLines(
        { hostname: 'example.test', www: 'www-to-root', tls: { mode: 'automatic' } },
        library
      ).map((line) => line.value),
    ]
    for (const sentence of sentences) expect(sentence).not.toMatch(RAW_WORDS)
  })

  it('says what the next deploy does with a hostname removed from the file', () => {
    expect(pendingRemovalNote(false)).toMatch(/^This hostname will be removed on the next deploy\./)
    expect(pendingRemovalNote(true)).toMatch(/managed on this screen again/)
  })

  it('names a library certificate by its name, then its first name on it, then its id', () => {
    expect(certificateLabel(library[0]!)).toBe('Shop wildcard')
    expect(certificateLabel(library[1]!)).toBe('example.test')
    expect(certificateLabel(certificate('33333333-cccc', '  '))).toBe('33333333')
  })

  it('finds the certificate a file names by id first, then by name', () => {
    expect(resolveCertificateRef('22222222-bbbb', library)?.id).toBe('22222222-bbbb')
    expect(resolveCertificateRef(' Shop wildcard ', library)?.id).toBe('11111111-aaaa')
    expect(resolveCertificateRef('missing', library)).toBeUndefined()
    expect(resolveCertificateRef(undefined, library)).toBeUndefined()
  })

  it('says the certificate choice in words', () => {
    expect(certificateChoiceText({ automatic: true })).toBe(LETS_ENCRYPT_CHOICE_TEXT)
    expect(certificateChoiceText({ automatic: false, certificate: library[0] })).toBe(
      'Your certificate “Shop wildcard”'
    )
    expect(certificateChoiceText({ automatic: false, certificate: null })).toBe(
      SELF_SIGNED_CHOICE_TEXT
    )
  })

  it('reads what a configured hostname asks for as its certificate', () => {
    expect(composeEntryCertificateText({ tls: { mode: 'automatic' } }, library)).toBe(
      LETS_ENCRYPT_CHOICE_TEXT
    )
    expect(composeEntryCertificateText({ tls: { mode: 'internal' } }, library)).toBe(
      SELF_SIGNED_CHOICE_TEXT
    )
    expect(composeEntryCertificateText({}, library)).toBe(SELF_SIGNED_CHOICE_TEXT)
    expect(
      composeEntryCertificateText(
        { tls: { mode: 'certificate', certificateRef: 'Shop wildcard' } },
        library
      )
    ).toBe('Your certificate “Shop wildcard”')
    expect(
      composeEntryCertificateText({ tls: { mode: 'certificate', certificateRef: 'gone' } }, library)
    ).toBe('A certificate named “gone” that is not in your library')
    // Without the library loaded the name is shown as written.
    expect(
      composeEntryCertificateText({ tls: { mode: 'certificate', certificateRef: 'gone' } }, null)
    ).toBe('Your certificate “gone”')
  })

  it('says what visitors get for the www spelling', () => {
    expect(composeEntryWwwText({ hostname: 'example.test', www: 'www-to-root' })).toBe(
      'www.example.test → example.test (permanent redirect, path kept)'
    )
    expect(composeEntryWwwText({ hostname: 'example.test' })).toBe('Only example.test answers')
  })

  it('summarises a configured hostname as three lines, with its path when it has one', () => {
    expect(
      composeEntrySummaryLines(
        { hostname: 'example.test', pathPrefix: '/shop', tls: { mode: 'automatic' } },
        library
      )
    ).toEqual([
      { label: 'Hostname', value: 'example.test/shop' },
      { label: 'www', value: 'Only example.test answers' },
      { label: 'Certificate', value: LETS_ENCRYPT_CHOICE_TEXT },
    ])
  })

  it('keeps the exact keys for the optional configuration detail', () => {
    expect(
      composeEntryConfigSnippet('web', [{ hostname: 'example.test', tls: { mode: 'automatic' } }])
    ).toBe(
      [
        'services:',
        '  web:',
        '    x-turbopanel:',
        '      hosting:',
        '        - hostname: example.test',
        '          tls:',
        '            mode: automatic',
      ].join('\n')
    )
  })

  it('says where a hostname lives', () => {
    expect(composeRouteSourceText(true)).toContain('this environment’s configuration file')
    expect(composeRouteSourceText(false)).toContain('Base tab')
  })

  it('says what Remove hostname really does in each state', () => {
    expect(removeHostnamePrompt('example.test', 'deployed')).toContain('released at once')
    expect(removeHostnamePrompt('example.test', 'adopted')).toContain(
      'managed on this screen again'
    )
    expect(removeHostnamePrompt('example.test', 'held-by-panel')).toContain('keeps being served')
    expect(removeHostnamePrompt('example.test', 'not-deployed')).toContain('not served yet')
  })

  it('says the name is released, and the route goes at the next deploy only when a server holds it', () => {
    expect(
      hostnameReleasedMessage('example.test', { removed: true, serverUpdate: 'next_deploy' })
    ).toBe('example.test is released. The server stops serving it at the next deploy.')
    expect(
      hostnameReleasedMessage('example.test', { removed: true, serverUpdate: 'not_deployed' })
    ).toBe('example.test is released.')
    expect(hostnameReleasedMessage('example.test', { removed: true })).toBe(
      'example.test is released.'
    )
    expect(hostnameReleasedMessage('example.test', { removed: false })).toBe(
      'example.test is managed on this screen again.'
    )
  })

  it('names the hostnames the control plane freed', () => {
    expect(
      hostnameReleasedMessage('fallback.test', {
        removed: true,
        hostnames: ['example.test', 'www.example.test'],
        serverUpdate: 'next_deploy',
      })
    ).toBe(
      'example.test, www.example.test are released. The server stops serving them at the next deploy.'
    )
    expect(hostnameReleasedMessage('fallback.test', { removed: true, hostnames: [] })).toBe(
      'fallback.test is released.'
    )
  })

  it('words a release refused because a deploy is running, pointing at Release now', () => {
    expect(
      removeNowErrorMessage({
        error:
          '/api/client/v1/hostings/abc/remove-now failed: HTTP 409: environment_deploy_running — A deploy is running.',
      })
    ).toBe(REMOVE_NOW_DEPLOY_RUNNING_MESSAGE)
    expect(REMOVE_NOW_DEPLOY_RUNNING_MESSAGE).toMatch(/A deploy is running.*Release now/)
    const other = removeNowErrorMessage({ error: 'Something broke' })
    expect(other).toContain('could not be released now')
    expect(other).toContain('Release now')
  })

  describe('releaseHostnameNow', () => {
    const refresh = () => vi.fn(async () => undefined)

    it('says released, and refreshes the list', async () => {
      const done = refresh()
      const outcome = await releaseHostnameNow('example.test', {
        run: async () => ({
          ok: true,
          value: { removed: true, hostnames: ['example.test'], serverUpdate: 'not_deployed' },
        }),
        refresh: done,
      })
      expect(outcome).toEqual({ tone: 'ok', message: 'example.test is released.' })
      expect(done).toHaveBeenCalledTimes(1)
    })

    it('shows the running-deploy refusal and still refreshes the list', async () => {
      const done = refresh()
      const outcome = await releaseHostnameNow('example.test', {
        run: async () => ({
          ok: false,
          error: 'x failed: HTTP 409: environment_deploy_running',
        }),
        refresh: done,
      })
      expect(outcome).toEqual({ tone: 'error', message: REMOVE_NOW_DEPLOY_RUNNING_MESSAGE })
      expect(done).toHaveBeenCalledTimes(1)
    })

    it('treats a 404 as an error, not as released', async () => {
      const outcome = await releaseHostnameNow('example.test', {
        run: async () => ({ ok: false, error: 'x failed: HTTP 404: Not found' }),
        refresh: refresh(),
      })
      expect(outcome.tone).toBe('error')
    })
  })

  it('says what a move keeps, and that undeployed changes stay behind for a deployed hostname', () => {
    expect(manageHereInsteadPrompt('example.test', 'deployed')).toContain('as last deployed')
    expect(manageHereInsteadPrompt('example.test', 'deployed')).toContain('not carried over')
    expect(manageHereInsteadPrompt('example.test', 'not-deployed')).toContain('certificate choice')
    expect(manageHereInsteadPrompt('example.test', 'held-by-panel')).toContain('Finish moving')
  })

  it('words a hostname save refused with 409 hostname_in_use, and keeps the fallback otherwise', () => {
    expect(hostingSaveErrorMessage({ error: RAW_REFUSALS[1] }, 'Could not save.')).toBe(
      HOSTNAME_IN_USE_MESSAGE
    )
    expect(
      hostingSaveErrorMessage({ error: null, cause: undefined }, 'Could not save this hostname.')
    ).toBe('Could not save this hostname.')
  })

  it('keeps the unreachable wording for a network failure that also fills error', () => {
    expect(
      hostingSaveErrorMessage(
        { error: 'Failed to fetch', cause: new TypeError('Failed to fetch') },
        'Could not save this hostname.'
      )
    ).toBe(CONTROL_PLANE_UNREACHABLE_COPY)
  })

  it('words a refused hosting action without paths or codes', () => {
    expect(hostingActionErrorMessage(RAW_REFUSALS[0])).toBe(DEPLOY_RUNNING_MESSAGE)
    expect(hostingActionErrorMessage(RAW_REFUSALS[1])).toBe(HOSTNAME_IN_USE_MESSAGE)
    expect(hostingActionErrorMessage(RAW_REFUSALS[2])).toBe(HOSTING_ACTION_FAILED_MESSAGE)
    expect(
      hostingActionErrorMessage('/api/client/v1/hostings failed: HTTP 400: compose_invalid')
    ).toBe(HOSTING_ACTION_FAILED_MESSAGE)
    expect(hostingActionErrorMessage('')).toBe(HOSTING_ACTION_FAILED_MESSAGE)
    expect(hostingActionErrorMessage(null)).toBe(HOSTING_ACTION_FAILED_MESSAGE)
    // A plain sentence of our own passes through unchanged.
    expect(hostingActionErrorMessage(SERVICE_NOT_SAVED_MESSAGE)).toBe(SERVICE_NOT_SAVED_MESSAGE)
  })

  it('keeps the issues of a refused compose file', () => {
    expect(
      hostingActionErrorMessage(
        "/api/client/v1/environments/abc failed: services.web.x-turbopanel.hosting[0].hostname must be a hostname; unknown key 'hostnme'"
      )
    ).toBe(
      "services.web.x-turbopanel.hosting[0].hostname must be a hostname; unknown key 'hostnme'"
    )
  })

  it('keeps the explanation of a refused hosting save', () => {
    expect(
      hostingActionErrorMessage(
        '/api/client/v1/hostings/abc failed: HTTP 400: invalid_hostname — Hostnames use letters, digits, dots and hyphens.'
      )
    ).toBe('Hostnames use letters, digits, dots and hyphens.')
  })

  it('names the real place certificates are added', () => {
    expect(COMPOSE_CERTIFICATE_HINT).toContain('Servers › TLS')
    expect(missingCertificateMessage('Shop wildcard')).toContain('“Shop wildcard”')
    expect(missingCertificateMessage('Shop wildcard')).toContain('Servers › TLS')
  })
})
