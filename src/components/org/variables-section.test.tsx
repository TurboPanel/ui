// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@/components/ui/v4/rn-stub'
import { VariablesSection } from './variables-section'

const state = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
  updateMutate: vi.fn(),
}))

vi.mock('react-native', async () => (await import('@/components/ui/v4/rn-stub')).reactNativeStub)
vi.mock('react-native-svg', async () => (await import('@/components/ui/v4/rn-stub')).svgStub)
vi.mock(
  '@/lib/theme-preference',
  async () => (await import('@/components/ui/v4/rn-stub')).themePreferenceStub
)
vi.mock('@/components/ui/panel-styles', () => ({ panelStyles: {} }))
vi.mock('@/components/ui', () => ({
  Checkbox: ({ label, onPress }: { label?: string; onPress?: () => void }) =>
    label ? <button onClick={onPress}>{label}</button> : null,
  LoadingState: () => null,
  SectionPanel: ({ children }: { children?: unknown }) => <section>{children as never}</section>,
}))
vi.mock('@/lib/query-client', () => ({ useCan: () => true }))
vi.mock('@/lib/queries/variables', () => ({
  useVariables: () => ({
    isLoading: false,
    isError: false,
    error: null,
    data: {
      variables: [
        {
          id: 'v1',
          key: 'API_URL',
          value: 'https://example.net',
          isSecret: false,
          isLiteral: false,
          forBuild: false,
          forRuntime: true,
          bindingId: null,
          description: null,
        },
      ],
    },
  }),
  // `actionError` is null: it is render state, empty inside the call that failed.
  useCreateVariable: () => ({ mutate: vi.fn(), isPending: false, actionError: null }),
  useUpdateVariable: () => ({
    mutate: state.updateMutate,
    isPending: false,
    variables: undefined,
    actionError: null,
  }),
  useDeleteVariable: () => ({
    mutate: state.deleteMutate,
    isPending: false,
    variables: undefined,
    actionError: null,
  }),
}))

beforeEach(() => {
  state.deleteMutate.mockReset()
  state.updateMutate.mockReset()
})
afterEach(cleanup)

describe('VariablesSection failed saves', () => {
  it('shows the sentence from the thrown error when a delete fails', () => {
    state.deleteMutate.mockImplementation((_id, options) =>
      options.onError(new Error('That variable is in use by a deploy.'))
    )
    render(<VariablesSection orgId="o" parentField={{ projectId: 'p' } as never} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('That variable is in use by a deploy.')).toBeTruthy()
    expect(screen.queryByText('Failed to delete variable')).toBeNull()
  })

  it('falls back to a plain sentence only when the error has no message', () => {
    state.deleteMutate.mockImplementation((_id, options) => options.onError(new Error('')))
    render(<VariablesSection orgId="o" parentField={{ projectId: 'p' } as never} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('Failed to delete variable')).toBeTruthy()
  })
})

describe('VariablesSection new secret value box', () => {
  function valueBox() {
    render(<VariablesSection orgId="o" parentField={{ projectId: 'p' } as never} initialShowAdd />)
    return screen.getByPlaceholderText('Plaintext value')
  }

  afterEach(() => {
    env.os = 'ios'
    vi.unstubAllGlobals()
  })

  it('hides a multi-line secret with CSS on the web', () => {
    env.os = 'web'
    vi.stubGlobal('CSS', { supports: () => true })
    const box = valueBox()
    expect(box.getAttribute('data-text-security')).toBeNull()
    fireEvent.click(screen.getByText('Secret'))
    const secret = screen.getByPlaceholderText('Secret value (write-only)')
    expect(secret.getAttribute('data-multiline')).toBe('yes')
    expect(secret.getAttribute('data-text-security')).toBe('disc')
  })

  it('falls back to a single-line password box when the browser cannot hide text', () => {
    env.os = 'web'
    vi.stubGlobal('CSS', { supports: () => false })
    valueBox()
    fireEvent.click(screen.getByText('Secret'))
    const secret = screen.getByPlaceholderText('Secret value (write-only)')
    expect(secret.getAttribute('type')).toBe('password')
    expect(secret.getAttribute('data-multiline')).toBeNull()
  })
})
