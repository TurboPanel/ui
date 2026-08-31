import { describe, expect, it } from 'vitest'
import {
  collectHostingExtensionValidationIssues,
  DEFAULT_HOSTING_TLS_MODE,
  HOSTING_TARGET_PORT_NOT_FOR_NODE_MESSAGE,
  HOSTING_TARGET_PORT_NOT_FOR_SITE_MESSAGE,
  HOSTING_TLS_MODE_AUTOMATIC_UNSUPPORTED_MESSAGE,
  hostingTargetPortAuthorable,
  hostingTlsModeOf,
} from './hosting-extension'
import type { ComposeServiceKind } from './service-kind'

const BASE = 'services.web.x-turbopanel'

function issuesFor(
  entry: Record<string, unknown>,
  serviceKind?: ComposeServiceKind,
) {
  return collectHostingExtensionValidationIssues(BASE, [entry], serviceKind)
}

/**
 * The editor must say exactly what the instance's save would say — these are
 * the two rules that changed shape, so they are the two worth pinning here.
 */
describe('hosting extension rules mirrored from the instance', () => {
  it('defaults an omitted tls block to internal', () => {
    expect(DEFAULT_HOSTING_TLS_MODE).toBe('internal')
    expect(hostingTlsModeOf({ hostname: 'app.example.com' })).toBe('internal')
  })

  it('refuses tls.mode automatic rather than blessing a self-signed deploy', () => {
    expect(issuesFor({ hostname: 'app.example.com', tls: { mode: 'automatic' } }))
      .toEqual([{
        path: `${BASE}.hosting[0].tls.mode`,
        message: HOSTING_TLS_MODE_AUTOMATIC_UNSUPPORTED_MESSAGE,
      }])
  })

  it('accepts internal and certificate', () => {
    expect(issuesFor({ hostname: 'a.example.com', tls: { mode: 'internal' } }))
      .toEqual([])
    expect(
      issuesFor({
        hostname: 'a.example.com',
        tls: { mode: 'certificate', certificateRef: 'wildcard' },
      }),
    ).toEqual([])
  })

  it('allows targetPort only on a container', () => {
    expect(hostingTargetPortAuthorable('container')).toBe(true)
    expect(hostingTargetPortAuthorable(undefined)).toBe(true)
    expect(hostingTargetPortAuthorable('site')).toBe(false)
    expect(hostingTargetPortAuthorable('node')).toBe(false)
  })

  it('refuses targetPort on node and site with their own messages', () => {
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 3000 }, 'node'))
      .toEqual([{
        path: `${BASE}.hosting[0].targetPort`,
        message: HOSTING_TARGET_PORT_NOT_FOR_NODE_MESSAGE,
      }])
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 8080 }, 'site'))
      .toEqual([{
        path: `${BASE}.hosting[0].targetPort`,
        message: HOSTING_TARGET_PORT_NOT_FOR_SITE_MESSAGE,
      }])
    expect(issuesFor({ hostname: 'a.example.com', targetPort: 8080 }, 'container'))
      .toEqual([])
  })
})
