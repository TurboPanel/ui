import { describe, expect, it } from 'vitest'
import {
  adminToolAccessLabel,
  adminToolBody,
  adminToolChoices,
  adminToolDeployChip,
  adminToolErrorMessage,
  adminToolReveal,
  hostnameHint,
  plainAdminToolNotes,
  PGADMIN_AUTO_CONNECT_NOTE,
} from './managed-admin-tools'

describe('adminToolChoices', () => {
  it('lists the tools that fit each engine, default first', () => {
    expect(adminToolChoices('mysql').map((row) => row.label)).toEqual(['phpMyAdmin', 'Adminer'])
    expect(adminToolChoices('mariadb').map((row) => row.label)).toEqual(['phpMyAdmin', 'Adminer'])
    expect(adminToolChoices('postgres').map((row) => row.label)).toEqual(['pgAdmin', 'Adminer'])
  })

  it('offers nothing for an unknown engine', () => {
    expect(adminToolChoices('redis')).toEqual([])
    expect(adminToolChoices(null)).toEqual([])
  })
})

describe('adminToolReveal', () => {
  it('shows the tool login for phpMyAdmin and Adminer', () => {
    expect(adminToolReveal({ loginName: 'adminer_k3x9q2', loginPassword: 'pw' })).toEqual({
      username: 'adminer_k3x9q2',
      password: 'pw',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      note: null,
      notes: [],
    })
  })

  it('shows the web account for pgAdmin, with the line that it connects by itself', () => {
    expect(
      adminToolReveal({
        loginName: 'pgadmin_k3x9q2',
        loginPassword: 'db',
        webEmail: 'me@example.com',
        webPassword: 'web',
      })
    ).toEqual({
      username: 'me@example.com',
      password: 'web',
      usernameLabel: 'Sign-In Email',
      passwordLabel: 'Sign-In Password',
      note: PGADMIN_AUTO_CONNECT_NOTE,
      notes: [],
    })
  })
})

describe('adminToolDeployChip', () => {
  it('maps the newest deploy to a chip', () => {
    expect(adminToolDeployChip({ status: 'running' })?.label).toBe('Deploying')
    expect(adminToolDeployChip({ status: 'queued' })?.label).toBe('Deploying')
    expect(adminToolDeployChip({ status: 'succeeded' })?.label).toBe('Running')
    expect(adminToolDeployChip({ status: 'failed' })?.label).toBe('Failed')
    expect(adminToolDeployChip({ status: 'timed_out' })?.label).toBe('Failed')
  })

  it('has no chip before the first deploy or after a cancelled one', () => {
    expect(adminToolDeployChip(null)).toBeNull()
    expect(adminToolDeployChip(undefined)).toBeNull()
    expect(adminToolDeployChip({ status: 'cancelled' })).toBeNull()
  })
})

describe('words and bodies', () => {
  it('names the access and the server', () => {
    expect(adminToolAccessLabel('admin')).toBe('Database Admin')
    expect(adminToolAccessLabel('read-only')).toBe('Read-Only')
    expect(hostnameHint('omicron')).toBe(
      'Point this name at omicron before you deploy, like any site.'
    )
    expect(hostnameHint()).toContain("this Database Cluster's server")
  })

  it('sends the hostname trimmed and lowercase with an explicit access', () => {
    expect(
      adminToolBody({ tool: 'adminer', hostname: ' DB.Example.com ', access: 'read-only' })
    ).toEqual({
      tool: 'adminer',
      hostname: 'db.example.com',
      access: 'read-only',
    })
  })

  it('says the refusals that carry no sentence in plain words', () => {
    expect(adminToolErrorMessage(new Error('HTTP 409: admin_tool_needs_database'), 'x')).toBe(
      'Add a database to this Database Cluster first.'
    )
    expect(
      adminToolErrorMessage(new Error('HTTP 409: managed_destroy_in_progress'), 'x')
    ).toContain('being destroyed')
  })

  it('falls back for an unknown failure', () => {
    expect(adminToolErrorMessage('boom', 'Failed to add')).toBe('Failed to add')
  })
})

describe('plainAdminToolNotes', () => {
  const noOwner = (access: string) =>
    `These databases have no owner role yet, so there is none for a Database admin login to work through: shop, blog. The login has ${access} there, and the full Database admin rights on every database that has an owner role. Move a database onto an owner role (POST …/managed/databases/{name}/owner-role with confirm: true) to give it the full rights there. It is never the root login.`

  it('keeps the database list of a no owner role note and drops the route', () => {
    expect(
      plainAdminToolNotes([
        noOwner(
          'read and write access to the data (no owner rights, and it cannot hand out access to others)'
        ),
      ])
    ).toEqual([
      "The tool's login has read and write access on shop, blog instead of full Database Admin rights.",
    ])
  })

  it('says can only connect when the note says connect only', () => {
    expect(
      plainAdminToolNotes([
        noOwner(
          "the right to connect only (this server's TurboPanel daemon is older; update it to give read and write access)"
        ),
      ])
    ).toEqual([
      "The tool's login can only connect on shop, blog instead of full Database Admin rights.",
    ])
  })

  it('turns both older daemon notes into one sentence', () => {
    const older = plainAdminToolNotes([
      "This server's TurboPanel daemon is older than owner roles, so the login was added with read and write access to the data instead of the full Database admin rights. Update the server and apply again to give it the full rights on databases that have an owner role.",
      "This server's TurboPanel daemon is older than the Database admin login, so the login was added with read and write access instead of all rights on its databases. Update the server and apply again to give it the full rights.",
    ])
    expect(older).toEqual([
      "This server's daemon is older, so the tool's login got read and write access only. Update the server, then apply again.",
    ])
  })

  it('passes other notes through, but never API wording', () => {
    expect(plainAdminToolNotes(['Something plain.'])).toEqual(['Something plain.'])
    expect(plainAdminToolNotes(['Call POST …/managed/x to fix it.'])[0]).not.toContain('POST')
    expect(plainAdminToolNotes(undefined)).toEqual([])
  })
})
