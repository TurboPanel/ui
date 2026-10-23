import { describe, expect, it } from 'vitest'
import {
  ServerAddressesSaveError,
  type ServerAddressEntry,
  type ServerAddressesView,
} from '@/lib/instance-api'
import {
  ADDRESSES_CERTIFICATE_PENDING,
  ADDRESSES_SAVE_FALLBACK,
  addressLine,
  addressRowTitle,
  addressSaveErrorMessage,
  addressSideLabel,
  buildAddressesPayload,
  certificatePendingMessage,
  connectionStringLabel,
  dnsNameLine,
  formFromEntry,
  mainConnectionLine,
  normalizeAddressHostname,
  portOverridesLine,
  validateAddressForm,
  type ServerAddressForm,
} from '@/lib/server-addresses'

const DC = '0190a000-0000-7000-8000-00000000000a'

function entry(overrides: Partial<ServerAddressEntry> = {}): ServerAddressEntry {
  return {
    scope: 'public',
    datacenterId: null,
    label: 'Public',
    saved: false,
    hostname: null,
    addressV4: null,
    addressV6: null,
    ports: {},
    primary: false,
    main: false,
    effective: {
      v4: '192.0.2.77',
      v4Source: 'reported',
      v6: null,
      v6Source: null,
      host: '192.0.2.77',
      hostSource: 'address',
    },
    ...overrides,
  }
}

const datacenter = entry({
  scope: 'datacenter',
  datacenterId: DC,
  label: 'Ashburn',
  effective: { v4: '10.0.0.5', v4Source: 'pin', v6: null, v6Source: null, host: '10.0.0.5', hostSource: 'address' },
})

function view(addresses: ServerAddressEntry[]): ServerAddressesView {
  return { externalAccess: true, linuxHostname: 'omega', addressNeeded: false, addresses }
}

function form(overrides: Partial<ServerAddressForm> = {}): ServerAddressForm {
  return {
    hostname: '',
    mode: 'own',
    addressV4: '',
    addressV6: '',
    ports: { postgres: '', mysql: '', http: '', https: '' },
    primary: false,
    ...overrides,
  }
}

function saveError(status: number, body: Record<string, unknown> | null) {
  return new ServerAddressesSaveError('/x', status, body)
}

describe('row display', () => {
  it('titles Public and datacenter rows', () => {
    expect(addressRowTitle(entry())).toBe('Public')
    expect(addressRowTitle(datacenter)).toBe('Datacenter Ashburn')
    expect(addressSideLabel('datacenter', ' ')).toBe('Datacenter')
    expect(addressSideLabel(null, null)).toBe('Public')
  })

  it('shows the DNS name or says there is none', () => {
    expect(dnsNameLine(entry())).toBe('No DNS name yet')
    expect(dnsNameLine(entry({ hostname: 'omega.example.com' }))).toBe('omega.example.com')
  })

  it("names the server's own address with where it came from", () => {
    expect(addressLine(entry())).toBe("This server's own: 192.0.2.77 (reported by the server)")
    expect(addressLine(datacenter)).toBe("This server's own: 10.0.0.5 (its address in this datacenter)")
    const both = entry({
      effective: { v4: '192.0.2.77', v4Source: 'ip', v6: '2001:db8::4', v6Source: null, host: null, hostSource: null },
    })
    expect(addressLine(both)).toBe(
      "This server's own: 192.0.2.77 (from the organization's address list), 2001:db8::4",
    )
    const none = entry({
      effective: { v4: null, v4Source: null, v6: null, v6Source: null, host: null, hostSource: null },
    })
    expect(addressLine(none)).toBe("This server's own: not known yet")
  })

  it('says "Through a router" when an address is saved', () => {
    expect(addressLine(entry({ addressV4: '203.0.113.7', addressV6: '2001:db8::7' }))).toBe(
      'Through a router: 203.0.113.7, 2001:db8::7',
    )
  })

  it('names the engines a row fills the main connection string for, when the control plane says', () => {
    expect(mainConnectionLine({ main: false })).toBeNull()
    expect(mainConnectionLine({ main: true })).toBe('Fills the main connection string')
    expect(mainConnectionLine({ main: true, mainFor: ['postgres'] })).toBe(
      'Fills the main connection string for Postgres',
    )
    expect(mainConnectionLine({ main: true, mainFor: ['postgres', 'mysql'] })).toBe(
      'Fills the main connection string for Postgres and MySQL',
    )
    expect(mainConnectionLine({ main: false, mainFor: [] })).toBeNull()
  })

  it('lists ports only when overridden', () => {
    expect(portOverridesLine({})).toBeNull()
    expect(portOverridesLine(undefined)).toBeNull()
    expect(portOverridesLine({ postgres: 25432, mysql: null, https: 8443 })).toBe(
      'Postgres 25432, MySQL not forwarded, Web (https) 8443',
    )
  })
})

describe('form', () => {
  it('starts from saved values only', () => {
    expect(formFromEntry(entry())).toEqual(form())
    const saved = entry({
      saved: true,
      hostname: 'db.example.com',
      addressV4: '203.0.113.7',
      ports: { postgres: 25432, mysql: null },
      primary: true,
    })
    expect(formFromEntry(saved)).toEqual(
      form({
        hostname: 'db.example.com',
        mode: 'different',
        addressV4: '203.0.113.7',
        ports: { postgres: '25432', mysql: '', http: '', https: '' },
        primary: true,
      }),
    )
  })

  it('normalizes the DNS name', () => {
    expect(normalizeAddressHostname('  DB.Example.COM. ')).toBe('db.example.com')
    expect(normalizeAddressHostname('   ')).toBeNull()
  })

  it('accepts a blank form and a full valid one', () => {
    expect(validateAddressForm(form())).toEqual({})
    expect(
      validateAddressForm(
        form({
          hostname: 'db.example.com',
          mode: 'different',
          addressV4: '203.0.113.7',
          addressV6: '2001:db8::7',
          ports: { postgres: '25432', mysql: '', http: '8080', https: '8443' },
        }),
      ),
    ).toEqual({})
  })

  it('refuses bad names, addresses and ports in plain words', () => {
    expect(validateAddressForm(form({ hostname: 'omega' })).hostname).toMatch(/with a dot/)
    expect(validateAddressForm(form({ hostname: 'bad_name.example.com' })).hostname).toMatch(
      /letters, numbers/,
    )
    expect(validateAddressForm(form({ hostname: '10.0.0.1' })).hostname).toMatch(/looks like an address/)
    expect(validateAddressForm(form({ mode: 'different' })).address).toMatch(/IPv4 or IPv6/)
    const bad = validateAddressForm(form({ mode: 'different', addressV4: '2001:db8::1', addressV6: '10.0.0.1' }))
    expect(bad.addressV4).toMatch(/Not an IPv4/)
    expect(bad.addressV6).toMatch(/Not an IPv6/)
    const ports = validateAddressForm(
      form({ ports: { postgres: '0', mysql: '70000', http: 'abc', https: '1.5' } }),
    )
    expect(Object.keys(ports).sort((a, b) => a.localeCompare(b))).toEqual([
      'http',
      'https',
      'mysql',
      'postgres',
    ])
  })

  it('ignores the address fields while "own address" is picked', () => {
    expect(validateAddressForm(form({ addressV4: 'nonsense' }))).toEqual({})
  })
})

describe('buildAddressesPayload', () => {
  it('sends the edited side and never sends detected values back', () => {
    const payload = buildAddressesPayload(
      view([entry(), datacenter]),
      entry(),
      form({ hostname: ' Omega.Example.com ', ports: { postgres: '25432', mysql: '', http: '', https: '' } }),
    )
    expect(payload.addresses).toEqual([
      {
        scope: 'public',
        hostname: 'omega.example.com',
        addressV4: null,
        addressV6: null,
        ports: { postgres: 25432 },
        primary: false,
      },
    ])
    expect(payload.editedIndex).toBe(0)
    expect(payload.titles).toEqual(['Public'])
  })

  it('keeps every other saved side and clears its main choice when this one takes it', () => {
    const savedPublic = entry({ saved: true, hostname: 'omega.example.com', primary: true })
    const payload = buildAddressesPayload(
      view([savedPublic, datacenter]),
      datacenter,
      form({ mode: 'different', addressV4: '198.51.100.9', primary: true }),
    )
    expect(payload.addresses).toEqual([
      {
        scope: 'public',
        hostname: 'omega.example.com',
        addressV4: null,
        addressV6: null,
        ports: {},
        primary: false,
      },
      {
        scope: 'datacenter',
        datacenterId: DC,
        hostname: null,
        addressV4: '198.51.100.9',
        addressV6: null,
        ports: {},
        primary: true,
      },
    ])
    expect(payload.titles).toEqual(['Public', 'Datacenter Ashburn'])
    expect(payload.editedIndex).toBe(1)
  })

  it('drops the edited side when it is cleared back to the defaults', () => {
    const savedDc = { ...datacenter, saved: true, hostname: 'omega.dc1.example.com' }
    const savedPublic = entry({ saved: true, hostname: 'omega.example.com' })
    const payload = buildAddressesPayload(view([savedPublic, savedDc]), savedPublic, form())
    expect(payload.addresses.map((input) => input.scope)).toEqual(['datacenter'])
    expect(payload.editedIndex).toBeNull()
  })

  it('keeps a port saved as not forwarded when its field is left empty', () => {
    const saved = entry({ saved: true, ports: { mysql: null, postgres: 25432 } })
    const payload = buildAddressesPayload(view([saved]), saved, formFromEntry(saved))
    expect(payload.addresses[0]?.ports).toEqual({ postgres: 25432, mysql: null })
  })
})

describe('addressSaveErrorMessage', () => {
  const payload = { titles: ['Public', 'Datacenter Ashburn'], editedIndex: 0 }

  it('maps every refusal code to a plain message', () => {
    for (const code of [
      'invalid_addresses',
      'address_scope_invalid',
      'address_datacenter_not_member',
      'address_duplicate',
      'address_hostname_invalid',
      'address_hostname_single_label',
      'address_v4_invalid',
      'address_v6_invalid',
      'address_ports_invalid',
      'address_primary_multiple',
    ]) {
      const message = addressSaveErrorMessage(saveError(400, { error: code, index: 0 }), payload)
      expect(message).not.toContain(code)
      expect(message).not.toBe(ADDRESSES_SAVE_FALLBACK)
    }
  })

  it('names the other row a refusal points at', () => {
    expect(
      addressSaveErrorMessage(saveError(400, { error: 'address_v4_invalid', index: 1 }), payload),
    ).toMatch(/\(in the Datacenter Ashburn row\)$/)
    expect(
      addressSaveErrorMessage(saveError(400, { error: 'address_v4_invalid', index: 0 }), payload),
    ).not.toMatch(/in the/)
  })

  it('says nothing was saved when the server is not ready for the change (422)', () => {
    const message = addressSaveErrorMessage(saveError(422, { error: 'daemon_key_unavailable' }), payload)
    expect(message).toMatch(/isn't ready to take this yet/)
    expect(message).toMatch(/^Nothing was saved/)
    expect(addressSaveErrorMessage(saveError(422, { error: 'other' }), payload)).toBe(ADDRESSES_SAVE_FALLBACK)
  })

  it('explains 503 and 404, and falls back for unknown codes and errors', () => {
    expect(addressSaveErrorMessage(saveError(503, null), payload)).toBe(
      "Nothing was saved: the panel can't send changes right now. Try again in a minute.",
    )
    expect(addressSaveErrorMessage(saveError(400, { error: 'new_code', message: 'Server words.' }), payload)).toBe(
      'Server words.',
    )
    expect(addressSaveErrorMessage(saveError(404, null), payload)).toMatch(/not found/)
    expect(addressSaveErrorMessage(saveError(400, { error: 'new_code' }), null)).toBe(
      ADDRESSES_SAVE_FALLBACK,
    )
    expect(addressSaveErrorMessage(new Error('offline'), payload)).toBe('offline')
    expect(addressSaveErrorMessage('nope', payload)).toBe(ADDRESSES_SAVE_FALLBACK)
  })
})

describe('certificatePendingMessage', () => {
  it('explains a saved list the certificate has not picked up yet, by reason', () => {
    expect(certificatePendingMessage('enqueue_failed')).toMatch(/Saved.*Save again to update the certificate/)
    expect(certificatePendingMessage('prepare_failed')).toMatch(
      /Saved, but the server's database listener can't be updated until its database problem is fixed/,
    )
    expect(certificatePendingMessage(null)).toBe(ADDRESSES_CERTIFICATE_PENDING)
    expect(certificatePendingMessage(null, 'Saved, but omega could not be told yet.')).toBe(
      'Saved, but omega could not be told yet.',
    )
    expect(certificatePendingMessage('prepare_failed', 'server words')).not.toBe('server words')
  })
})

describe('connectionStringLabel', () => {
  it('labels each connection string by its side and host', () => {
    expect(connectionStringLabel({ scope: 'public', label: 'Public', host: 'omega.example.com' })).toBe(
      'Public: omega.example.com',
    )
    expect(
      connectionStringLabel({ scope: 'datacenter', label: 'Ashburn', host: 'omega.dc1.example.com' }),
    ).toBe('Datacenter Ashburn: omega.dc1.example.com')
    expect(connectionStringLabel({ host: '192.0.2.77' })).toBe('Public: 192.0.2.77')
  })
})
