// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  Checkbox: () => null,
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
