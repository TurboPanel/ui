import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MANAGED_INGRESS_PORTS,
  managedIngressPortForEngine,
  managedIngressPortRejectionMessage,
  parseManagedIngressPortInput,
  rejectManagedIngressPort,
  resolveManagedIngressPorts,
  validateManagedIngressPorts,
} from './managed-ingress-ports'

describe('rejectManagedIngressPort', () => {
  it('accepts the platform defaults', () => {
    expect(rejectManagedIngressPort(DEFAULT_MANAGED_INGRESS_PORTS.postgres)).toBeNull()
    expect(rejectManagedIngressPort(DEFAULT_MANAGED_INGRESS_PORTS.mysqlFamily)).toBeNull()
  })

  it('rejects privileged, out-of-range, and non-integer values', () => {
    // Privileged ports need root to bind, so they are never offered.
    expect(rejectManagedIngressPort(443)).toBe('out_of_range')
    expect(rejectManagedIngressPort(1023)).toBe('out_of_range')
    expect(rejectManagedIngressPort(0)).toBe('out_of_range')
    expect(rejectManagedIngressPort(65536)).toBe('out_of_range')
    expect(rejectManagedIngressPort(15432.5)).toBe('out_of_range')
    expect(rejectManagedIngressPort('15432')).toBe('out_of_range')
    expect(rejectManagedIngressPort(null)).toBe('out_of_range')
  })

  it("rejects ProxySQL's own admin interfaces", () => {
    expect(rejectManagedIngressPort(6032)).toBe('reserved_admin')
    expect(rejectManagedIngressPort(6132)).toBe('reserved_admin')
  })

  it('allows the engine-native ports, which the daemon preflight guards instead', () => {
    // Nothing binds 5432/3306 on the host by default: managed members live on
    // the container network and publish from the private 45xxx range. A real
    // conflict with an operator's own database is caught by the host bind
    // preflight, so the form must not pre-emptively refuse them.
    expect(rejectManagedIngressPort(5432)).toBeNull()
    expect(rejectManagedIngressPort(3306)).toBeNull()
  })

  it('rejects the managed replication listener range', () => {
    expect(rejectManagedIngressPort(45000)).toBe('reserved_private_range')
    expect(rejectManagedIngressPort(45500)).toBe('reserved_private_range')
    expect(rejectManagedIngressPort(45999)).toBe('reserved_private_range')
    expect(rejectManagedIngressPort(46000)).toBeNull()
  })
})

describe('validateManagedIngressPorts', () => {
  it('accepts a distinct pair', () => {
    expect(validateManagedIngressPorts({ postgres: 18432, mysqlFamily: 18306 })).toEqual({
      ok: true,
    })
  })

  it('names the offending field for a per-port rejection', () => {
    expect(validateManagedIngressPorts({ postgres: 6032, mysqlFamily: 13306 })).toEqual({
      ok: false,
      field: 'postgres',
      reason: 'reserved_admin',
    })
    expect(validateManagedIngressPorts({ postgres: 15432, mysqlFamily: 80 })).toEqual({
      ok: false,
      field: 'mysqlFamily',
      reason: 'out_of_range',
    })
  })

  it('catches a collision, including one override landing on the other inherited default', () => {
    expect(validateManagedIngressPorts({ postgres: 18432, mysqlFamily: 18432 })).toEqual({
      ok: false,
      field: 'mysqlFamily',
      reason: 'collision',
    })
    // Only PostgreSQL was overridden, onto MySQL's inherited platform listener.
    expect(
      validateManagedIngressPorts(
        resolveManagedIngressPorts({ postgres: DEFAULT_MANAGED_INGRESS_PORTS.mysqlFamily }),
      ),
    ).toEqual({ ok: false, field: 'mysqlFamily', reason: 'collision' })
  })
})

describe('parseManagedIngressPortInput', () => {
  it('treats a blank field as inheriting the platform default', () => {
    expect(parseManagedIngressPortInput('')).toEqual({ ok: true, value: null })
    expect(parseManagedIngressPortInput('   ')).toEqual({ ok: true, value: null })
  })

  it('accepts a surrounded-by-whitespace port', () => {
    expect(parseManagedIngressPortInput(' 18432 ')).toEqual({ ok: true, value: 18432 })
  })

  it('rejects non-digit input without treating it as a clear', () => {
    expect(parseManagedIngressPortInput('18432a')).toEqual({
      ok: false,
      reason: 'out_of_range',
    })
    expect(parseManagedIngressPortInput('-1')).toEqual({ ok: false, reason: 'out_of_range' })
  })

  it('surfaces the reserved reasons for numerically valid input', () => {
    expect(parseManagedIngressPortInput('6032')).toEqual({
      ok: false,
      reason: 'reserved_admin',
    })
    expect(parseManagedIngressPortInput('45100')).toEqual({
      ok: false,
      reason: 'reserved_private_range',
    })
  })
})

describe('resolveManagedIngressPorts', () => {
  it('falls back to the platform defaults', () => {
    expect(resolveManagedIngressPorts(null)).toEqual(DEFAULT_MANAGED_INGRESS_PORTS)
    expect(resolveManagedIngressPorts(undefined)).toEqual(DEFAULT_MANAGED_INGRESS_PORTS)
    expect(resolveManagedIngressPorts({})).toEqual(DEFAULT_MANAGED_INGRESS_PORTS)
  })

  it('does not let one overridden family drag the other off its listener', () => {
    expect(resolveManagedIngressPorts({ postgres: 18432 })).toEqual({
      postgres: 18432,
      mysqlFamily: DEFAULT_MANAGED_INGRESS_PORTS.mysqlFamily,
    })
    expect(resolveManagedIngressPorts({ mysqlFamily: null })).toEqual(
      DEFAULT_MANAGED_INGRESS_PORTS,
    )
  })
})

describe('managedIngressPortForEngine', () => {
  it('rides MariaDB on the MySQL listener', () => {
    const ports = { postgres: 18432, mysqlFamily: 18306 }
    expect(managedIngressPortForEngine('mysql', ports)).toBe(18306)
    expect(managedIngressPortForEngine('mariadb', ports)).toBe(18306)
    expect(managedIngressPortForEngine('postgres', ports)).toBe(18432)
  })

  it('defaults to the platform listeners when no override is resolved', () => {
    expect(managedIngressPortForEngine('postgres')).toBe(
      DEFAULT_MANAGED_INGRESS_PORTS.postgres,
    )
    expect(managedIngressPortForEngine('mariadb')).toBe(
      DEFAULT_MANAGED_INGRESS_PORTS.mysqlFamily,
    )
  })
})

describe('managedIngressPortRejectionMessage', () => {
  it('explains each rejection inline', () => {
    expect(managedIngressPortRejectionMessage('out_of_range')).toContain('1024')
    expect(managedIngressPortRejectionMessage('reserved_admin')).toContain('admin')
    expect(managedIngressPortRejectionMessage('reserved_private_range')).toContain('45000')
    expect(managedIngressPortRejectionMessage('collision')).toContain('different ports')
  })
})
