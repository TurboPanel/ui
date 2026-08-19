import { describe, expect, it } from 'vitest'
import {
  EXPO_START_DEFAULT_ORIGIN,
  parseExpoStartOrigin,
  shouldPromptForControlPlane,
  upsertControlPlaneEnvLine,
} from '@/lib/expo-start-prompt'

describe('shouldPromptForControlPlane', () => {
  it('prompts only on an interactive TTY without a preset URL', () => {
    expect(
      shouldPromptForControlPlane({ isTty: true }),
    ).toBe(true)
    expect(
      shouldPromptForControlPlane({
        isTty: true,
        controlPlaneUrl: 'https://localhost:8443',
      }),
    ).toBe(false)
    expect(
      shouldPromptForControlPlane({
        isTty: true,
        controlPlaneUrl: '   ',
      }),
    ).toBe(true)
    expect(
      shouldPromptForControlPlane({ isTty: true, skipPrompt: '1' }),
    ).toBe(false)
    expect(
      shouldPromptForControlPlane({ isTty: true, ci: 'true' }),
    ).toBe(false)
    expect(
      shouldPromptForControlPlane({ isTty: true, ci: '1' }),
    ).toBe(false)
    expect(
      shouldPromptForControlPlane({ isTty: false }),
    ).toBe(false)
  })
})

describe('parseExpoStartOrigin', () => {
  it('defaults when empty and accepts http(s) origins', () => {
    expect(parseExpoStartOrigin('')).toEqual({
      ok: true,
      origin: EXPO_START_DEFAULT_ORIGIN,
    })
    expect(parseExpoStartOrigin('   ')).toEqual({
      ok: true,
      origin: EXPO_START_DEFAULT_ORIGIN,
    })
    expect(parseExpoStartOrigin('http://203.0.113.20:8880/')).toEqual({
      ok: true,
      origin: 'http://203.0.113.20:8880',
    })
    expect(parseExpoStartOrigin('not-a-url')).toEqual({
      ok: false,
      error: 'Enter a valid http(s) URL',
    })
    expect(parseExpoStartOrigin('ftp://x')).toEqual({
      ok: false,
      error: 'URL must start with http:// or https://',
    })
  })

  it('honors a custom fallback origin', () => {
    expect(parseExpoStartOrigin('', 'https://panel.example')).toEqual({
      ok: true,
      origin: 'https://panel.example',
    })
  })
})

describe('upsertControlPlaneEnvLine', () => {
  it('writes or replaces EXPO_PUBLIC_CONTROL_PLANE_URL', () => {
    expect(upsertControlPlaneEnvLine('', EXPO_START_DEFAULT_ORIGIN)).toBe(
      `EXPO_PUBLIC_CONTROL_PLANE_URL=${EXPO_START_DEFAULT_ORIGIN}\n`,
    )
    expect(
      upsertControlPlaneEnvLine(
        'FOO=1\nEXPO_PUBLIC_CONTROL_PLANE_URL=https://old.example\n',
        'https://new.example',
      ),
    ).toBe('FOO=1\nEXPO_PUBLIC_CONTROL_PLANE_URL=https://new.example\n')
  })

  it('appends a trailing blank line before a new key', () => {
    expect(
      upsertControlPlaneEnvLine('FOO=1', EXPO_START_DEFAULT_ORIGIN),
    ).toBe(`FOO=1\n\nEXPO_PUBLIC_CONTROL_PLANE_URL=${EXPO_START_DEFAULT_ORIGIN}\n`)
  })
})
