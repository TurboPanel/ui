// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeployPreviewBody } from './deploy-preview-panel'
import type { DeployPreviewResponse } from '@/lib/instance-api'

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({
  panelStyles: { muted: {}, error: {}, expandedSection: {} },
}))
vi.mock('@/components/org/readonly-yaml-block', () => ({
  ReadOnlyYamlBlock: ({ value }: { value: string }) => <pre>{value}</pre>,
}))
vi.mock('@/components/ui', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  LoadingState: ({ label }: { label: string }) => <div>{label}</div>,
}))
vi.mock('@/lib/queries', () => ({ useDeployPreview: () => ({}) }))

afterEach(cleanup)

// Shape of a real answer for a Node app cloned from a branch: the source has
// no commitSha (the branch name is not a commit) and the empty lists are empty.
const nodeApp = {
  ok: true,
  projectName: 'demo',
  composeFiles: [{ filename: 'compose.yaml', role: 'runtime', content: 'services: {}' }],
  sources: [
    {
      composeServiceName: 'web',
      sourceId: 'src_1',
      provider: 'git',
      cloneUrl: 'https://example.com/acme/app.git',
      ref: 'main',
      releaseId: 'rel_1',
    },
  ],
  nativeAppVariables: [
    {
      composeServiceName: 'web',
      variables: [
        { name: 'PORT', source: 'platform', isSecret: false, value: '3000', delivered: true },
      ],
    },
  ],
  containers: [],
  volumes: [],
  warnings: [],
  secretPlan: [],
} as unknown as DeployPreviewResponse

describe('DeployPreviewBody', () => {
  it('renders a Node app source without a commit', () => {
    const { container } = render(
      <DeployPreviewBody loading={false} error={null} preview={nodeApp} />
    )
    expect(container.textContent).toContain(
      'web ← https://example.com/acme/app@main → release rel_1'
    )
    expect(container.textContent).toContain('PORT = 3000')
  })

  it('shows the short commit when the answer carries one', () => {
    const preview = {
      ...nodeApp,
      sources: [{ ...nodeApp.sources![0], commitSha: '0123456789abcdef' }],
    } as DeployPreviewResponse
    const { container } = render(
      <DeployPreviewBody loading={false} error={null} preview={preview} />
    )
    expect(container.textContent).toContain('@main (0123456) → release rel_1')
  })

  it('tolerates every optional list being absent', () => {
    const preview = {
      ok: true,
      projectName: 'demo',
      composeFiles: [],
      containers: [],
      volumes: [],
    } as unknown as DeployPreviewResponse
    expect(() =>
      render(<DeployPreviewBody loading={false} error={null} preview={preview} />)
    ).not.toThrow()
  })

  it('tolerates a native app and a server entry without their lists', () => {
    const preview = {
      ...nodeApp,
      warnings: undefined,
      nativeAppVariables: [{ composeServiceName: 'web' }],
      servers: [
        { serverId: 's1', name: 'herp' },
        { serverId: 's2', name: 'two' },
      ],
    } as unknown as DeployPreviewResponse
    expect(() =>
      render(<DeployPreviewBody loading={false} error={null} preview={preview} />)
    ).not.toThrow()
  })
})
