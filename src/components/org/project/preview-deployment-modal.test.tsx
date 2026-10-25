// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyScenario, env, SCENARIOS, styleOf, token } from '@/components/ui/v4/rn-stub'
import { confirmSubtitle, confirmTitle, PreviewDeploymentModal } from './preview-deployment-modal'

const { usePreparedComposePreview } = vi.hoisted(() => ({
  usePreparedComposePreview: vi.fn(() => ({ loading: false, error: null, preview: null })),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui', async () => ({
  TextLink: (await import('@/components/ui/text-link')).TextLink,
  SegmentedControl: (await import('@/components/ui/segmented-control')).SegmentedControl,
  ModalSheet: ({
    visible,
    title,
    description,
    footer,
    children,
  }: Readonly<{
    visible: boolean
    title: string
    description?: string
    footer?: ReactNode
    children: ReactNode
  }>) =>
    visible ? (
      <div role="dialog" aria-label={title}>
        <p>{description}</p>
        {children}
        <footer>{footer}</footer>
      </div>
    ) : null,
}))
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/org/deploy-preview-panel', () => ({
  DeployPreviewBody: () => <div>prepared compose</div>,
  usePreparedComposePreview,
}))
vi.mock('@/components/org/readonly-yaml-block', () => ({
  ReadOnlyYamlBlock: ({ value }: Readonly<{ value: string }>) => <pre>{value}</pre>,
}))
vi.mock('@/lib/compose', () => ({ composePreviewMergedYaml: () => 'services: {}' }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  usePreparedComposePreview.mockClear()
})

function coarsePointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: coarse }))
}

const base = {
  visible: true,
  orgId: 'org-1',
  environmentId: 'env-1',
  environmentLabel: 'production',
  canManage: true,
  placementServerId: 'srv-1',
  placementServerLabel: 'web-1',
  projectCompose: {},
} as const

/** Whether the last render asked for the prepared preview. */
function preparedFetchEnabled(): boolean {
  const calls = usePreparedComposePreview.mock.calls as unknown as unknown[][]
  return calls.at(-1)?.[3] === true
}

describe('deploy confirm copy', () => {
  it('asks a plain question and says what happens where', () => {
    expect(confirmTitle('Deploy', 'production')).toBe('Deploy production?')
    expect(confirmTitle('Redeploy')).toBe('Redeploy this environment?')
    expect(confirmSubtitle('production', 'web-1')).toBe(
      'This builds production and runs it on web-1.'
    )
    expect(confirmSubtitle('production', null)).toBe(
      'Choose a server for production before deploying.'
    )
  })
})

describe.each(SCENARIOS)('deploy confirm dialog ($name)', (scenario) => {
  beforeEach(() => {
    applyScenario(scenario)
    coarsePointer(false)
  })

  it('makes Deploy the filled primary button and Cancel the secondary one', () => {
    render(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Deploy production?' })).toBeTruthy()
    expect(screen.getByText('This builds production and runs it on web-1.')).toBeTruthy()
    const deploy = screen.getByRole('button', { name: 'Deploy' })
    const cancel = screen.getByRole('button', { name: 'Cancel deployment' })
    expect(styleOf(deploy).backgroundColor).toBe(token(scenario, 'accent'))
    expect(styleOf(cancel).backgroundColor).toBe(token(scenario, 'surface2'))
    expect(styleOf(cancel).borderColor).toBe(token(scenario, 'sepStrong'))
  })

  it('gives both buttons the control height, 44 on touch', () => {
    render(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const expected = scenario.os === 'web' ? 36 : 44
    expect(styleOf(screen.getByRole('button', { name: 'Deploy' })).minHeight).toBe(expected)
    expect(styleOf(screen.getByRole('button', { name: 'Cancel deployment' })).minHeight).toBe(
      expected
    )
  })
})

describe('deploy confirm dialog', () => {
  beforeEach(() => {
    applyScenario(SCENARIOS[0])
    coarsePointer(false)
  })

  it('folds what will run away until asked, and fetches nothing before', () => {
    render(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const disclosure = screen.getByRole('button', { name: 'Show what will run' })
    expect(disclosure.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('prepared compose')).toBeNull()
    expect(preparedFetchEnabled()).toBe(false)
    fireEvent.click(disclosure)
    expect(
      screen.getByRole('button', { name: 'Hide what will run' }).getAttribute('aria-expanded')
    ).toBe('true')
    expect(screen.getByText('prepared compose')).toBeTruthy()
    expect(preparedFetchEnabled()).toBe(true)
  })

  it('folds the detail again when the dialog closes', () => {
    const { rerender } = render(
      <PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Show what will run' }))
    rerender(
      <PreviewDeploymentModal {...base} visible={false} onCancel={vi.fn()} onConfirm={vi.fn()} />
    )
    rerender(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Show what will run' })).toBeTruthy()
    expect(preparedFetchEnabled()).toBe(false)
  })

  it('confirms and cancels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<PreviewDeploymentModal {...base} onCancel={onCancel} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Deploy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deployment' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('blocks Deploy until a server is chosen, and says so', () => {
    render(
      <PreviewDeploymentModal
        {...base}
        placementServerId={null}
        placementServerLabel={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />
    )
    expect(screen.getByText('Choose a server for production before deploying.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deploy' }).getAttribute('aria-disabled')).toBe(
      'true'
    )
  })

  it('shows Deploying… and blocks both buttons while deploying', () => {
    render(<PreviewDeploymentModal {...base} deploying onCancel={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Deploy' }).textContent).toBe('Deploying…')
    expect(
      screen.getByRole('button', { name: 'Cancel deployment' }).getAttribute('aria-disabled')
    ).toBe('true')
  })

  it('stacks full width with Deploy on top on a phone-width window', () => {
    env.width = 390
    render(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const buttons = screen.getAllByRole('button').filter((b) => b.closest('footer'))
    expect(buttons.map((b) => b.textContent)).toEqual(['Deploy', 'Cancel'])
    expect(styleOf(buttons[0]).alignSelf).toBe('stretch')
  })

  it('puts Deploy last on a desktop dialog', () => {
    render(<PreviewDeploymentModal {...base} onCancel={vi.fn()} onConfirm={vi.fn()} />)
    const buttons = screen.getAllByRole('button').filter((b) => b.closest('footer'))
    expect(buttons.map((b) => b.textContent)).toEqual(['Cancel', 'Deploy'])
  })

  it('switches between the merged and prepared views', () => {
    render(
      <PreviewDeploymentModal {...base} purpose="inspect" initialMode="merged" onCancel={vi.fn()} />
    )
    expect(screen.getByRole('tab', { name: 'Merged' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Prepared' }))
    expect(screen.getByRole('tab', { name: 'Prepared' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('prepared compose')).toBeTruthy()
  })

  it('keeps the inspect view open with no disclosure and a Close button', () => {
    render(
      <PreviewDeploymentModal {...base} purpose="inspect" initialMode="merged" onCancel={vi.fn()} />
    )
    expect(screen.getByRole('dialog', { name: 'Compose Preview' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show what will run' })).toBeNull()
    expect(screen.getByText('services: {}')).toBeTruthy()
    expect(screen.getByText('Target server · web-1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close preview' }).textContent).toBe('Close')
  })
})
