import { describe, expect, it } from 'vitest'
import {
  ADD_SERVER_STEPS,
  addServerProgress,
  addServerWaitingLabel,
  type AddServerProgressInput,
} from '@/lib/add-server-steps'
import type { LicenseRecord, OrgServerRecord } from '@/lib/instance-api'

const KEY = 'lic-1'

function license(extra: Partial<LicenseRecord> = {}): LicenseRecord {
  return {
    id: KEY,
    name: null,
    createdAt: '2026-11-05T10:00:00.000Z',
    revocable: true,
    boundServer: null,
    ...extra,
  }
}

function server(extra: Partial<OrgServerRecord> = {}): OrgServerRecord {
  return {
    id: 'srv-1',
    licenseId: KEY,
    connected: false,
    hostname: null,
    os: null,
    osDisplay: null,
    resources: null,
    ...extra,
  } as OrgServerRecord
}

function statesOf(input: AddServerProgressInput): string[] {
  const { states } = addServerProgress(input)
  return ADD_SERVER_STEPS.map((step) => states[step.id])
}

const WAITING: AddServerProgressInput = { screen: 'waiting', creating: false, licenseId: KEY }

describe('ADD_SERVER_STEPS', () => {
  it('lists six steps in book title case', () => {
    expect(ADD_SERVER_STEPS.map((step) => step.label)).toEqual([
      'Name',
      'Install Command',
      'Run the Installer',
      'Enroll',
      'Connect',
      'Ready',
    ])
  })
})

describe('addServerProgress', () => {
  it('waits on the person while they fill in the form, and spins while the key is made', () => {
    const idle = { screen: 'create', creating: false, licenseId: null } as const
    expect(statesOf(idle)).toEqual([
      'active',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
    expect(statesOf({ ...idle, creating: true })[0]).toBe('running')
  })

  it('shows the install command as the step waiting on the person', () => {
    expect(statesOf({ screen: 'install', creating: false, licenseId: KEY })).toEqual([
      'done',
      'active',
      'pending',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('spins on the installer until the control plane hears from the daemon', () => {
    const progress = addServerProgress({ ...WAITING, licenses: [license()], servers: [] })
    expect(progress.reached).toBe('install')
    expect(statesOf({ ...WAITING, licenses: [license()] })).toEqual([
      'done',
      'done',
      'running',
      'pending',
      'pending',
      'pending',
    ])
  })

  it('moves to Enroll once the key is provisioning, even from the install command screen', () => {
    const licenses = [
      license({ provisioning: { since: '2026-11-05T10:01:00Z', hostname: 'web1' } }),
    ]
    expect(addServerProgress({ ...WAITING, licenses }).reached).toBe('enroll')
    expect(
      addServerProgress({ screen: 'install', creating: false, licenseId: KEY, licenses }).reached
    ).toBe('enroll')
    expect(statesOf({ ...WAITING, licenses })[3]).toBe('running')
  })

  it('moves to Connect once the key is bound to a server that is not connected yet', () => {
    const bound = [license({ boundServer: { id: 'srv-1', name: null, connected: false } })]
    expect(addServerProgress({ ...WAITING, licenses: bound }).reached).toBe('connect')
    expect(addServerProgress({ ...WAITING, servers: [server()] }).reached).toBe('connect')
    expect(statesOf({ ...WAITING, servers: [server()] })).toEqual([
      'done',
      'done',
      'done',
      'done',
      'running',
      'pending',
    ])
  })

  it('spins on Ready while only the key list says connected, then finishes with the server list', () => {
    const bare = addServerProgress({
      ...WAITING,
      licenses: [license({ boundServer: { id: 'srv-1', name: null, connected: true } })],
    })
    expect(bare.reached).toBe('ready')
    expect(bare.complete).toBe(false)
    expect(bare.states.ready).toBe('running')

    const done = addServerProgress({
      ...WAITING,
      servers: [server({ connected: true })],
    })
    expect(done.complete).toBe(true)
    expect(Object.values(done.states).every((state) => state === 'done')).toBe(true)
  })

  it('ignores other keys and servers', () => {
    const other = addServerProgress({
      ...WAITING,
      licenses: [license({ id: 'other', provisioning: { since: 'x', hostname: null } })],
      servers: [server({ licenseId: 'other', connected: true })],
    })
    expect(other.reached).toBe('install')
  })

  it('stops the spinner when the wizard stopped checking', () => {
    expect(statesOf({ ...WAITING, checkStopped: true })[2]).toBe('active')
  })
})

describe('addServerWaitingLabel', () => {
  it('says what the wizard is waiting for at each step', () => {
    expect(addServerWaitingLabel('install', 12, null)).toBe(
      'Waiting for this host to connect (12s)'
    )
    expect(addServerWaitingLabel('enroll', 3, ' web1 ')).toBe('Enrolling web1 (3s)')
    expect(addServerWaitingLabel('enroll', 3, null)).toBe('Enrolling this host (3s)')
    expect(addServerWaitingLabel('connect', 4, null)).toBe(
      'Enrolled; waiting for the server to connect (4s)'
    )
    expect(addServerWaitingLabel('ready', 5, null)).toBe(
      'Connected; waiting for the server to report its details'
    )
  })
})
