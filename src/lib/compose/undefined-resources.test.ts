import { describe, expect, it } from 'vitest'
import { COMPOSE_TAG_KEY } from './tags'
import { undefinedResourceIssues } from './undefined-resources'

const web = (extra: Record<string, unknown>) => ({ services: { web: { image: 'x', ...extra } } })
const messages = (data: Record<string, unknown>) =>
  undefinedResourceIssues(data).map((i) => i.message)

describe('undefinedResourceIssues', () => {
  it('names a short-syntax volume no top-level entry declares', () => {
    const [message, ...rest] = messages(web({ volumes: ['cfg:/c'] }))
    expect(rest).toEqual([])
    expect(message).toContain('volume "cfg"')
    expect(message).toContain('does not declare')
  })

  it('skips interpolated sources and keeps a colon inside ${...} out of the split', () => {
    const volumes = [
      '${DATA_DIR}:/data',
      '{$DATA}:/data',
      '${X:-./d}:/d',
      '${Y:-named}:/n',
      { type: 'volume', source: '${DATA_DIR}', target: '/l' },
    ]
    expect(messages(web({ volumes }))).toEqual([])
  })

  it('checks a long-syntax volume but not a bind or tmpfs mount', () => {
    const volumes = [
      { type: 'volume', source: 'cfg', target: '/c' },
      { type: 'bind', source: 'cfg2', target: '/b' },
      { type: 'tmpfs', target: '/t' },
    ]
    const found = messages(web({ volumes }))
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('volume "cfg"')
  })

  it('ignores bind paths and anonymous volumes', () => {
    expect(messages(web({ volumes: ['./a:/a', '/b:/b', '~/c:/c', '/anon'] }))).toEqual([])
  })

  it('lets network_mode stand in for networks', () => {
    expect(messages(web({ network_mode: 'host', networks: ['back'] }))).toEqual([])
  })

  it('counts an external volume as declared', () => {
    const data = { ...web({ volumes: ['s:/s'] }), volumes: { s: { external: true } } }
    expect(messages(data)).toEqual([])
  })

  it('reads a !reset volumes mapping as removed', () => {
    const data = {
      ...web({ volumes: ['s:/s'] }),
      volumes: { [COMPOSE_TAG_KEY]: 'reset', value: null },
    }
    expect(messages(data)).toHaveLength(1)
  })

  it('refuses an undeclared network, secret and config', () => {
    const data = web({ networks: ['back'], secrets: ['tok'], configs: [{ source: 'cfg' }] })
    expect(messages(data)).toHaveLength(3)
  })
})
