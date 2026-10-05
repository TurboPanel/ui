/**
 * Test support for the v4 primitives (not shipped: only test files import it).
 *
 * Plain DOM stand-ins for the React Native pieces the primitives use, so a
 * test checks roles, labels, styles and behaviour without a native runtime,
 * plus a scenario switch that paints the same component three ways: on the
 * web (CSS variable references) and on a phone in each theme (real values).
 */
import { createElement, type ReactNode } from 'react'
import { cssVarRef, paletteFor, type ColorScheme, type PaletteKey } from '@/lib/theme-palettes'

type Props = Readonly<Record<string, unknown> & { children?: ReactNode }>

export type Scenario = Readonly<{ name: string; os: 'web' | 'ios'; scheme: ColorScheme }>

export const SCENARIOS: readonly Scenario[] = [
  { name: 'web', os: 'web', scheme: 'dark' },
  { name: 'phone Navy', os: 'ios', scheme: 'dark' },
  { name: 'phone Paper', os: 'ios', scheme: 'light' },
]

export const env = {
  os: 'web' as string,
  scheme: 'dark' as ColorScheme,
  width: 1200,
  coarsePointer: false,
}

export function applyScenario(scenario: Scenario): void {
  env.os = scenario.os
  env.scheme = scenario.scheme
  env.width = 1200
  env.coarsePointer = false
}

/** What a colour token must equal in a scenario. */
export function token(scenario: Scenario, key: PaletteKey): string {
  return scenario.os === 'web' ? cssVarRef(key) : paletteFor(scenario.scheme)[key]
}

export function flatten(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  if (typeof style === 'function') return flatten((style as (s: { pressed: boolean }) => unknown)({ pressed: false }))
  return style as Record<string, unknown>
}

/** The flattened style a component put on a DOM node. */
export function styleOf(element: Element | null | undefined): Record<string, unknown> {
  const raw = (element as HTMLElement | null | undefined)?.dataset.style
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

const ROLE: Record<string, string> = {
  header: 'heading',
  summary: 'group',
  image: 'img',
  tablist: 'tablist',
}

function aria(props: Props) {
  const state = (props.accessibilityState ?? {}) as Record<string, boolean>
  const role = props.accessibilityRole as string | undefined
  return {
    role: role ? (ROLE[role] ?? role) : undefined,
    'aria-label': props.accessibilityLabel as string | undefined,
    'aria-selected': state.selected,
    'aria-checked': state.checked,
    'aria-disabled': state.disabled,
    'aria-busy': state.busy,
    'aria-live': props.accessibilityLiveRegion as string | undefined,
    'aria-hidden': props.accessibilityElementsHidden ? true : undefined,
    'data-style': JSON.stringify(flatten(props.style)),
  }
}

function dom(tag: string) {
  return function Stub(props: Props) {
    return createElement(tag, aria(props), props.children)
  }
}

export const reactNativeStub = {
  Platform: {
    get OS() {
      return env.os
    },
    select: (o: Record<string, unknown>) => o[env.os] ?? o.default,
  },
  StyleSheet: { create: (s: unknown) => s, absoluteFill: { position: 'absolute' }, flatten },
  View: dom('div'),
  Text: ({ children, selectable, numberOfLines, ...rest }: Props) =>
    createElement('span', { ...aria(rest as Props), 'data-selectable': selectable ? 'yes' : undefined, 'data-lines': numberOfLines as number }, children),
  ScrollView: dom('div'),
  ActivityIndicator: (props: Props) => createElement('span', { role: 'progressbar', 'data-color': props.color as string }),
  Pressable: (props: Props) => {
    const press = props.onPress as (() => void) | undefined
    const child =
      typeof props.children === 'function'
        ? (props.children as (s: { pressed: boolean }) => ReactNode)({ pressed: false })
        : props.children
    return createElement(
      'button',
      {
        type: 'button',
        ...aria(props),
        disabled: Boolean(props.disabled),
        onClick: () => press?.(),
      },
      child,
    )
  },
  Modal: ({ visible, children, animationType, onRequestClose }: Props) =>
    visible
      ? createElement(
          'div',
          { role: 'dialog', 'data-animation': animationType as string, onKeyDown: () => (onRequestClose as () => void)?.() },
          children,
        )
      : null,
  useWindowDimensions: () => ({ width: env.width, height: 800 }),
}

function svgDom(tag: string) {
  return function SvgStub(props: Props) {
    const { children, ...rest } = props
    const attrs: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(rest)) {
      if (key === 'importantForAccessibility') continue
      if (typeof value === 'string' || typeof value === 'number') attrs[key] = value
    }
    attrs['aria-hidden'] = props.accessibilityElementsHidden ? true : undefined
    return createElement(tag, attrs, children)
  }
}

export const svgStub = {
  default: svgDom('svg'),
  Circle: svgDom('circle'),
  Path: svgDom('path'),
  Rect: svgDom('rect'),
}

export const themePreferenceStub = {
  useColors: () => paletteFor(env.scheme),
}

export const linearGradientStub = {
  LinearGradient: (props: Props) =>
    createElement('div', {
      'data-gradient': (props.colors as string[]).join(','),
      'data-style': JSON.stringify(flatten(props.style)),
    }),
}
