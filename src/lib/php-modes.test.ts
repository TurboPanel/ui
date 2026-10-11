import { describe, expect, it } from 'vitest'
import {
  affectedSiteLine,
  draftFromPolicy,
  engineDefaultLines,
  draftHasListedMode,
  isPolicyModeListed,
  isPolicyModeSelectable,
  phpModeUnavailableNote,
  policyFromDraft,
  sameModes,
  toggleDraftMode,
} from './php-modes'

const ALL = ['fastcgi', 'fpm', 'lsphp-detached', 'lsphp-attached'] as const

describe('php-modes helpers', () => {
  it('shows every mode on when nothing is narrowed', () => {
    expect(draftFromPolicy(null)).toEqual([...ALL])
    expect(draftFromPolicy(['fpm', 'fastcgi'])).toEqual(['fastcgi', 'fpm'])
    expect(draftFromPolicy(null, ['fpm'])).toEqual(['fpm'])
  })

  it('sends null when the draft covers everything offerable', () => {
    expect(policyFromDraft([...ALL])).toBeNull()
    expect(policyFromDraft(['fpm', 'fastcgi'])).toEqual(['fastcgi', 'fpm'])
    expect(policyFromDraft(['fpm'], ['fpm'])).toBeNull()
    expect(policyFromDraft([])).toEqual([])
  })

  it('toggles in canonical order', () => {
    expect(toggleDraftMode(['fpm'], 'fastcgi')).toEqual(['fastcgi', 'fpm'])
    expect(toggleDraftMode(['fastcgi', 'fpm'], 'fpm')).toEqual(['fastcgi'])
    expect(sameModes(['fpm', 'fastcgi'], ['fastcgi', 'fpm'])).toBe(true)
    expect(sameModes(['fpm'], ['fastcgi'])).toBe(false)
    expect(sameModes(['fpm'], [])).toBe(false)
  })

  it('does not list attached lsphp and never lets it be switched', () => {
    expect(isPolicyModeListed('lsphp-attached')).toBe(false)
    expect(isPolicyModeListed('lsphp-detached')).toBe(true)
    expect(draftHasListedMode(['lsphp-attached'])).toBe(false)
    expect(draftHasListedMode(['lsphp-attached', 'fpm'])).toBe(true)
    expect(draftHasListedMode([])).toBe(false)
    expect(isPolicyModeSelectable('lsphp-attached')).toBe(false)
    expect(isPolicyModeSelectable('lsphp-attached', [...ALL])).toBe(false)
    expect(isPolicyModeSelectable('fpm')).toBe(true)
    expect(isPolicyModeSelectable('fpm', ['fastcgi'])).toBe(false)
    expect(phpModeUnavailableNote('lsphp-attached', null)).toBe('')
    expect(phpModeUnavailableNote('fpm', ['fastcgi'])).toBe('Not offered by the organization')
    expect(phpModeUnavailableNote('fpm', null)).toBe('')
  })

  it('summarises the default per web server', () => {
    expect(
      engineDefaultLines({
        caddy: { allowed: [], default: null },
        nginx: { allowed: ['fpm'], default: 'fpm' },
        'nginx+apache': { allowed: ['fastcgi'], default: 'fastcgi' },
        openlitespeed: { allowed: [], default: null },
      })
    ).toEqual([
      'nginx: PHP-FPM (scales with traffic)',
      'nginx + Apache: FastCGI (default, light)',
      'OpenLiteSpeed: no mode offered',
    ])
  })

  it('names an affected site with its kept mode', () => {
    expect(
      affectedSiteLine({
        environmentId: 'e',
        serverId: 's',
        composeServiceName: 'web',
        mode: 'fpm',
      })
    ).toBe('web (PHP-FPM (scales with traffic))')
  })
})
