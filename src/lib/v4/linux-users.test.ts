import { describe, expect, it } from 'vitest'
import {
  accessText,
  checkLinuxUserName,
  defaultLinuxUser,
  isSystemUserName,
  linuxAccess,
  linuxUserFromDeclared,
  linuxUserFromRecord,
  linuxUserNameLimit,
  linuxUserRows,
  resolveRunsAs,
  runsAsLinuxUser,
  RUNS_IN_CONTAINER,
} from './linux-users'
import {
  SAMPLE_ENVIRONMENTS,
  sampleDefaultUser,
  sampleEnvironment,
  sampleProject,
  sampleView,
} from './sample-projects.fixtures'

const website = sampleProject('website')
const portal = sampleProject('portal')
const api = sampleProject('api')

function runsAsFor(
  project: ReturnType<typeof sampleProject>,
  serviceId: string,
  envId: string | null,
) {
  const service = project.services.find((item) => item.id === serviceId)
  if (service === undefined) throw new Error('no service')
  return resolveRunsAs({
    service,
    base: project.base,
    env: envId === null ? undefined : sampleView(sampleEnvironment(project, envId)),
    users: project.users,
    defaultUser: sampleDefaultUser(project),
  })
}

describe('access words', () => {
  it('maps the API level and the compose level to the same words', () => {
    expect(linuxAccess('shell')).toBe('ssh')
    expect(linuxAccess('ssh')).toBe('ssh')
    expect(linuxAccess('sftp')).toBe('sftp')
    expect(linuxAccess('none')).toBe('none')
    expect(accessText('ssh')).toBe('SFTP + SSH on')
    expect(accessText('sftp')).toBe('SFTP on')
    expect(accessText('none')).toBe('No sign-in')
  })

  it('builds a user from a control plane record', () => {
    expect(
      linuxUserFromRecord({
        username: 'shop',
        appliedUsername: 'shop_x7k2m9qpz1a',
        access: 'shell',
        sshKeyCount: 2,
        passwordAuth: true,
      }),
    ).toEqual({
      name: 'shop',
      systemName: 'shop_x7k2m9qpz1a',
      access: 'ssh',
      sshKeyCount: 2,
      passwordAuth: true,
      createdOnFirstDeploy: false,
    })
  })

  it('builds a user the Base declares but no deploy has created', () => {
    expect(linuxUserFromDeclared('shop')).toEqual({
      name: 'shop',
      systemName: 'shop',
      access: 'none',
      sshKeyCount: 0,
      passwordAuth: false,
      createdOnFirstDeploy: true,
    })
    expect(linuxUserFromDeclared('shop', 'ssh').access).toBe('ssh')
  })

  it('falls back to the first user, then to the project name', () => {
    expect(defaultLinuxUser([linuxUserFromDeclared('a'), linuxUserFromDeclared('b')], 'Shop')).toBe('a')
    expect(defaultLinuxUser([], 'My Shop')).toBe('my-shop')
  })
})

describe('Runs as', () => {
  it.each(SAMPLE_ENVIRONMENTS)('%s: every app says who runs it', (_name, project, env) => {
    for (const service of project.services) {
      const runs = resolveRunsAs({
        service,
        base: project.base,
        env: sampleView(env),
        users: project.users,
        defaultUser: sampleDefaultUser(project),
      })
      expect(runs.label).toMatch(/^Runs (as |inside its container)/)
    }
  })

  it('shows the Testing user for the website and the Base user elsewhere', () => {
    const testing = runsAsFor(website, 'web', 'testing')
    expect(testing).toMatchObject({
      label: 'Runs as testing-web',
      short: 'as testing-web',
      user: 'testing-web',
      source: 'env',
      sourceLabel: 'Testing change',
      runsInContainer: false,
    })
    expect(runsAsFor(website, 'web', 'production')).toMatchObject({
      user: 'website',
      source: 'base',
      sourceLabel: 'Base',
    })
    expect(runsAsFor(website, 'web', null)).toMatchObject({ user: 'website', sourceLabel: 'Base' })
    expect(runsAsFor(portal, 'app', 'staging').user).toBe('portal-staging')
  })

  it('says a stand-alone environment sets its own user', () => {
    expect(runsAsFor(portal, 'app', 'preview')).toMatchObject({
      user: 'portal',
      source: 'own',
      sourceLabel: 'Set in Preview',
    })
  })

  it('says what sign-in the user has', () => {
    expect(runsAsFor(website, 'web', 'production')).toMatchObject({ access: 'SFTP on', hasAccess: true })
    expect(runsAsFor(website, 'web', 'testing')).toMatchObject({ access: 'No sign-in', hasAccess: false })
    expect(runsAsFor(sampleProject('blog'), 'site', null).access).toBe('SFTP + SSH on')
  })

  it('uses the default user when nothing sets one, and has no sign-in info for an unknown user', () => {
    const runs = resolveRunsAs({
      service: { id: 'x', kind: 'node' },
      base: {},
      users: [],
      defaultUser: 'shop',
    })
    expect(runs).toMatchObject({ user: 'shop', access: 'No sign-in', hasAccess: false })
  })

  it('has no picker for containers and databases', () => {
    const runs = runsAsFor(api, 'api', 'production')
    expect(runs).toMatchObject({
      runsInContainer: true,
      label: RUNS_IN_CONTAINER,
      short: RUNS_IN_CONTAINER,
      user: '',
      hasAccess: false,
      source: 'image',
    })
    expect(runsAsFor(api, 'db', null).label).toBe(RUNS_IN_CONTAINER)
    expect(runsAsLinuxUser({ kind: 'node' })).toBe(true)
    expect(runsAsLinuxUser({ kind: 'site' })).toBe(true)
    expect(runsAsLinuxUser({ kind: 'container' })).toBe(false)
    expect(runsAsLinuxUser({ kind: 'database' })).toBe(false)
  })
})

describe('Linux users table', () => {
  function rowsFor(project: ReturnType<typeof sampleProject>) {
    return linuxUserRows({
      users: project.users,
      services: project.services,
      base: project.base,
      environments: project.environments.map(sampleView),
      defaultUser: sampleDefaultUser(project),
    })
  }

  it('lists which apps run as each user, per environment', () => {
    const rows = rowsFor(website)
    expect(rows[0]?.usesText).toBe('web in Production, Staging')
    expect(rows[0]?.otherText).toBe('web in Testing runs as testing-web')
    expect(rows[0]).toMatchObject({ hasOther: true, inUse: true, accessText: 'SFTP on', accessLabel: 'SFTP' })
    expect(rows[1]).toMatchObject({
      name: 'testing-web',
      usesText: 'web in Testing',
      hasOther: false,
      otherText: '',
      accessText: 'No sign-in',
    })
  })

  it('writes the sub line from access, keys and state', () => {
    expect(rowsFor(website)[0]?.sub).toBe('SFTP on · 1 SSH key')
    expect(rowsFor(website)[1]?.sub).toBe('No sign-in · created on the first deploy')
    expect(rowsFor(sampleProject('blog'))[0]).toMatchObject({
      sub: 'SFTP + SSH on · 2 SSH keys · password set',
      keysText: '2 SSH keys',
    })
    expect(rowsFor(portal)[0]?.accessText).toBe('SFTP on')
  })

  it('says when no app runs as a user', () => {
    const rows = linuxUserRows({
      users: [linuxUserFromDeclared('spare')],
      services: website.services,
      base: website.base,
      environments: website.environments.map(sampleView),
      defaultUser: 'website',
    })
    expect(rows[0]).toMatchObject({
      usesText: 'No app runs as this user yet',
      inUse: false,
      uses: [],
      keysText: 'No SSH keys',
    })
  })

  it('has no rows for a project without users', () => {
    expect(rowsFor(api)).toEqual([])
  })
})

describe('Linux user name rule', () => {
  it('accepts a good name and explains the rule', () => {
    expect(checkLinuxUserName('shop-web')).toEqual({
      ok: true,
      msg: 'Lowercase, up to 28 characters. Created on the first deploy.',
    })
    expect(checkLinuxUserName('a_b-9').ok).toBe(true)
    expect(checkLinuxUserName('a'.repeat(28)).ok).toBe(true)
  })

  it('refuses an empty name', () => {
    expect(checkLinuxUserName('')).toEqual({ ok: false, msg: 'Give the user a name' })
  })

  it('refuses a name that is too long', () => {
    expect(checkLinuxUserName('a234567890123456789012345678x')).toEqual({
      ok: false,
      msg: 'Up to 28 characters',
    })
  })

  it.each(['Bad Name', 'Shop', 'shop web', '1shop', '-shop', 'shop.web', ' shop', 'shop '])(
    'refuses %j',
    (name) => {
      expect(checkLinuxUserName(name)).toEqual({
        ok: false,
        msg: 'Lowercase letters, numbers, - and _ only, starting with a letter',
      })
    },
  )

  it('keeps the shorter limit when the system name adds 12 characters', () => {
    expect(linuxUserNameLimit('partial')).toBe(16)
    expect(linuxUserNameLimit('plain')).toBe(28)
    expect(linuxUserNameLimit('random')).toBe(28)
    expect(linuxUserNameLimit()).toBe(28)
    expect(checkLinuxUserName('a'.repeat(17), { scheme: 'partial' })).toEqual({
      ok: false,
      msg: 'Up to 16 characters',
    })
    expect(checkLinuxUserName('a'.repeat(16), { scheme: 'partial' }).ok).toBe(true)
    expect(checkLinuxUserName('a'.repeat(17), { scheme: 'plain' }).ok).toBe(true)
  })

  it('refuses names the system keeps', () => {
    for (const name of [
      'root',
      'www-data',
      'postgres',
      'tp',
      'tpdata',
      'tpanything',
      'systemd-x',
      // The user's own group carries its name; these groups grant power.
      'sudo',
      'admin',
      'wheel',
      'adm',
      'staff',
      'lxd',
      'containers',
      'wireshark',
      'bob-grp',
      'ftp',
      'git',
      'nginx',
      'ubuntu',
      'vagrant',
      'ec2-user',
    ]) {
      expect(checkLinuxUserName(name)).toEqual({ ok: false, msg: 'The system keeps that name' })
    }
    expect(isSystemUserName(' Root ')).toBe(true)
    expect(isSystemUserName('shop')).toBe(false)
  })

  it('refuses a name that is taken, by display name or system name, ignoring case and spaces', () => {
    const taken = [
      { name: 'portal', systemName: 'portal_x7k2m9qpz1a' },
      { name: 'Other', systemName: ' OTHER ' },
    ]
    expect(checkLinuxUserName('portal', { taken })).toEqual({
      ok: false,
      msg: 'A Linux user called portal already exists',
    })
    expect(checkLinuxUserName('portal_x7k2m9qpz1a', { taken }).ok).toBe(false)
    expect(checkLinuxUserName('other', { taken }).ok).toBe(false)
    expect(checkLinuxUserName('portal2', { taken }).ok).toBe(true)
    expect(checkLinuxUserName('portal', { taken: [] }).ok).toBe(true)
  })

  it('checks sample projects add a third user', () => {
    expect(checkLinuxUserName('shop-web', { taken: website.users }).ok).toBe(true)
    expect(checkLinuxUserName('testing-web', { taken: website.users }).ok).toBe(false)
  })
})
