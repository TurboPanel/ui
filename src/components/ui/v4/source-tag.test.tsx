// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { SourceTag } from '@/components/ui/v4/source-tag'
import { sourceLabel } from '@/lib/v4/change-labels'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('@/lib/theme-preference', async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub)

afterEach(cleanup)

describe.each(SCENARIOS)('SourceTag ($name)', (scenario) => {
  beforeEach(() => applyScenario(scenario))

  it('Base: an outlined grey pill', () => {
    render(<SourceTag source="base" label={sourceLabel('base', 'Staging')} />)
    const tag = screen.getByLabelText('Base')
    expect(tag.textContent).toBe('Base')
    expect(styleOf(tag).borderColor).toBe(token(scenario, 'sepStrong'))
    expect(styleOf(tag).backgroundColor).toBe('transparent')
    expect(styleOf(tag).minHeight).toBe(22)
    expect(styleOf(tag).borderRadius).toBe(999)
  })

  it('"{Env} change": blue on a blue tint', () => {
    render(<SourceTag source="env" label={sourceLabel('env', 'Staging')} />)
    const tag = screen.getByLabelText('Staging change')
    expect(styleOf(tag).backgroundColor).toBe(token(scenario, 'baseSoft'))
    expect(styleOf(tag).borderColor).toBe(token(scenario, 'baseLine'))
    expect(styleOf(screen.getByText('Staging change')).color).toBe(token(scenario, 'base'))
  })

  it('"Set in {Env}": a dashed outline in grey', () => {
    render(<SourceTag source="own" label={sourceLabel('own', 'Staging')} />)
    const tag = screen.getByLabelText('Set in Staging')
    expect(styleOf(tag).borderStyle).toBe('dashed')
    expect(styleOf(screen.getByText('Set in Staging')).color).toBe(token(scenario, 'text3'))
  })

  it('says "Project" for a shared variable', () => {
    render(<SourceTag source="base" label={sourceLabel('base', 'Staging', true)} />)
    expect(screen.getByLabelText('Project')).toBeTruthy()
  })
})
