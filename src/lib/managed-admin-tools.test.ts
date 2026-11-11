import { describe, expect, it } from 'vitest'
import {
  adminToolAccessLabel,
  adminToolBody,
  adminToolChoices,
  adminToolDeployChip,
  adminToolErrorMessage,
  adminToolReveal,
  hostnameHint,
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
