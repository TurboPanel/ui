import { describe, expect, it } from 'vitest'
import {
  collectRootExtensionValidationIssues,
  DEFAULT_PRINCIPAL_ACCESS,
  isPrincipalAccess,
  isPrincipalAlias,
  parseRootExtension,
  PLACEMENT_NOT_STORED_MESSAGE,
  principalAccessOf,
  type TurbopanelRootExtension,
} from './root-extension'
import type { TurbopanelRuntimeRootExtension } from './index'
import { lintComposeYaml } from './lint'

function messagesFor(extension: unknown): string[] {
  return collectRootExtensionValidationIssues('x-turbopanel', extension).map(
    (issue) => `${issue.path}: ${issue.message}`
  )
}

describe('parseRootExtension', () => {
  it('keeps principals and drops malformed entries', () => {
    expect(
      parseRootExtension({
        principals: {
          web: { description: '  serves the site  ', access: 'sftp' },
          empty: {},
          'not a valid alias': { access: 'ssh' },
          wrongShape: ['nope'],
        },
      })
    ).toEqual({
      principals: {
        web: { description: 'serves the site', access: 'sftp' },
        empty: {},
      },
    })
  })

  it('treats absent and empty values as an empty root', () => {
    expect(parseRootExtension(null)).toEqual({})
    expect(parseRootExtension(undefined)).toEqual({})
    expect(parseRootExtension({})).toEqual({})
    expect(parseRootExtension({ principals: {} })).toEqual({})
    expect(parseRootExtension('x-turbopanel')).toBeNull()
    expect(parseRootExtension(['principals'])).toBeNull()
  })

  it('defaults access to none', () => {
    expect(DEFAULT_PRINCIPAL_ACCESS).toBe('none')
    expect(principalAccessOf({})).toBe('none')
    expect(principalAccessOf({ access: 'ssh' })).toBe('ssh')
    expect(isPrincipalAccess('sftp')).toBe(true)
    // The compose vocabulary is `ssh`; `shell` is the principal row's own word.
    expect(isPrincipalAccess('shell')).toBe(false)
    expect(isPrincipalAlias('web-1_a')).toBe(true)
    expect(isPrincipalAlias('1web')).toBe(false)
    expect(isPrincipalAlias('a'.repeat(65))).toBe(false)
  })
})

describe('collectRootExtensionValidationIssues', () => {
  it('accepts a principals-only root', () => {
    expect(
      messagesFor({
        principals: {
          web: { description: 'serves the site', access: 'sftp' },
          worker: {},
          jobs: null,
        },
      })
    ).toEqual([])
  })

  it('rejects placement', () => {
    expect(messagesFor({ placement: { server_id: 'anything' } })).toEqual([
      `x-turbopanel.placement: ${PLACEMENT_NOT_STORED_MESSAGE}`,
    ])
  })

  it('redirects principal-record keys to where they actually live', () => {
    expect(
      messagesFor({
        uid: 10001,
        gid: 10001,
        home: '/srv/users/web',
        shell: '/bin/bash',
        password: 'hunter2',
        authorized_keys: ['ssh-ed25519 AAAA'],
        server_id: '11111111-1111-4111-8111-111111111111',
        cgroup: 'tenant.slice',
      })
    ).toEqual([
      'x-turbopanel.uid: uid is not authored in compose; operator id overrides live on principal.options',
      'x-turbopanel.gid: gid is not authored in compose; operator id overrides live on principal.options',
      "x-turbopanel.home: home is not authored in compose; the daemon derives a principal's home directory (turbopaneld ensure-principal.ts)",
      'x-turbopanel.shell: shell is not authored in compose; the access level is encoded by principal.options.shell',
      'x-turbopanel.password: password is not authored in compose; principal credentials live on the ssh table',
      'x-turbopanel.authorized_keys: authorized_keys is not authored in compose; principal keys live on the ssh table',
      `x-turbopanel.server_id: ${PLACEMENT_NOT_STORED_MESSAGE}`,
      'x-turbopanel.cgroup: cgroup is not authored in compose; resource limits are org and server policy',
    ])
  })

  it('reports any other unknown root key, schemaVersion included', () => {
    expect(messagesFor({ schemaVersion: 1 })).toEqual([
      'x-turbopanel.schemaVersion: unknown x-turbopanel key "schemaVersion"; supported: principals',
    ])
  })

  it('validates the principals block and each principal body', () => {
    expect(messagesFor({ principals: ['web'] })).toEqual([
      'x-turbopanel.principals: principals must be a mapping of alias to principal',
    ])
    expect(messagesFor({ principals: { 'web site': {} } })).toEqual([
      'x-turbopanel.principals.web site: principal alias must start with a letter and contain only letters, digits, "-", and "_" (at most 64 characters)',
    ])
    expect(
      messagesFor({
        principals: {
          web: { description: 12, access: 'shell' },
          api: { description: 'x'.repeat(501) },
          jobs: 'sftp',
          keys: { uid: 10001, nickname: 'w' },
        },
      })
    ).toEqual([
      'x-turbopanel.principals.web.description: description must be a string',
      'x-turbopanel.principals.web.access: access must be "none", "sftp", or "ssh"',
      'x-turbopanel.principals.api.description: description must be at most 500 characters',
      'x-turbopanel.principals.jobs: principal must be a mapping',
      'x-turbopanel.principals.keys.uid: uid is not authored in compose; operator id overrides live on principal.options',
      'x-turbopanel.principals.keys.nickname: unknown principal key "nickname"; supported: access, description',
    ])
  })
})

describe('lintComposeYaml root x-turbopanel', () => {
  it('accepts a principals-only root extension', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
x-turbopanel:
  principals:
    web:
      description: serves the site
      access: sftp
`)
    expect(issues).toEqual([])
  })

  it('reports unknown and forbidden root keys on the authored line', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
x-turbopanel:
  cgroup: tenant.slice
  placement:
    server_id: 11111111-1111-4111-8111-111111111111
`)
    expect(
      issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        level: issue.level,
        line: issue.line,
      }))
    ).toEqual([
      {
        path: 'x-turbopanel.cgroup',
        message:
          'cgroup is not authored in compose; resource limits are org and server policy',
        level: 'error',
        line: 5,
      },
      {
        path: 'x-turbopanel.placement',
        message: PLACEMENT_NOT_STORED_MESSAGE,
        level: 'error',
        line: 6,
      },
    ])
  })

  it('reports a bad principal access value on its own line', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
x-turbopanel:
  principals:
    web:
      access: root
`)
    expect(issues).toEqual([
      {
        level: 'error',
        message: 'access must be "none", "sftp", or "ssh"',
        path: 'x-turbopanel.principals.web.access',
        line: 7,
      },
    ])
  })

  it('stays quiet about the root block while the extension is hidden', () => {
    const issues = lintComposeYaml(`services:
  web:
    image: nginx
x-turbopanel:
  cgroup: tenant.slice
`, { managedExtensionHidden: true })
    // The hidden surface warns that the block is managed, and says nothing
    // about its contents — the author did not type them here.
    expect(issues.map((issue) => issue.path)).toEqual(['x-turbopanel'])
  })
})

/**
 * The authored root and the runtime root are separate types on purpose (see
 * `./root-extension`). This is the compile-time half of that guarantee.
 */
describe('authored versus runtime root extension types', () => {
  it('gives the authored type no placement key', () => {
    type AuthoredKeys = keyof TurbopanelRootExtension
    type NoPlacement = Extract<AuthoredKeys, 'placement'> extends never
      ? true
      : false
    const authoredHasNoPlacement: NoPlacement = true
    expect(authoredHasNoPlacement).toBe(true)

    const authored: TurbopanelRootExtension = { principals: { web: {} } }
    const runtime: TurbopanelRuntimeRootExtension = {
      placement: { server_id: '11111111-1111-4111-8111-111111111111' },
    }
    expect(Object.keys(authored)).toEqual(['principals'])
    expect(Object.keys(runtime)).toEqual(['placement'])
  })
})
