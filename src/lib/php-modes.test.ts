import { describe, expect, it } from 'vitest'
import {
  affectedSiteLine,
  draftFromPolicy,
  engineDefaultLines,
  isPolicyModeSelectable,
  phpModeUnavailableNote,
  policyFromDraft,
  sameModes,
  toggleDraftMode,
} from './php-modes'
import type { PhpModeEngineChoices } from './instance-api'

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

  it('keeps attached lsphp disabled unless the API reports it allowed', () => {
    const closed: PhpModeEngineChoices = {
      openlitespeed: { allowed: ['fastcgi', 'lsphp-detached'], default: 'fastcgi' },
    }
    const open: PhpModeEngineChoices = {
      openlitespeed: { allowed: [...ALL], default: 'fastcgi' },
    }
    expect(isPolicyModeSelectable('lsphp-attached', closed)).toBe(false)
    expect(isPolicyModeSelectable('lsphp-attached', open)).toBe(true)
    expect(isPolicyModeSelectable('lsphp-attached', {})).toBe(false)
    expect(isPolicyModeSelectable('fpm', closed)).toBe(true)
    expect(isPolicyModeSelectable('fpm', closed, ['fastcgi'])).toBe(false)
    expect(phpModeUnavailableNote('lsphp-attached', null)).toBe('Coming soon')
    expect(phpModeUnavailableNote('fpm', ['fastcgi'])).toBe('Not offered by the organization')
    expect(phpModeUnavailableNote('fpm', null)).toBe('')
  })

  it('summarises the default per web server', () => {
    expect(
      engineDefaultLines({
        caddy: { allowed: [], default: null },
        nginx: { allowed: ['fpm'], default: 'fpm' },
        openlitespeed: { allowed: [], default: null },
      })
    ).toEqual(['nginx: PHP-FPM (scales with traffic)', 'OpenLiteSpeed: no mode offered'])
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
