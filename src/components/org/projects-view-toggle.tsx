import { useRef } from 'react'
import { Pressable, View } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { themedStyles, usePalette } from '@/components/ui/v4/use-palette'
import { PROJECTS_VIEWS, type ProjectsView } from '@/lib/projects-view'
import { webPointer } from '@/lib/theme'

const styles = themedStyles((p) => ({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 3,
    gap: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: p.sepStrong,
    backgroundColor: p.surface2,
  },
  button: {
    width: 32,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { backgroundColor: p.surface, borderWidth: 1, borderColor: p.sep },
}))

const LABEL: Record<ProjectsView, string> = { grid: 'Grid', list: 'List' }

function ViewIcon({ view, color }: Readonly<{ view: ProjectsView; color: string }>) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.75 } as const
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" accessibilityElementsHidden>
      {view === 'grid' ? (
        <>
          <Rect x={4} y={4} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={13.5} y={4} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={4} y={13.5} width={6.5} height={6.5} rx={1.5} {...stroke} />
          <Rect x={13.5} y={13.5} width={6.5} height={6.5} rx={1.5} {...stroke} />
        </>
      ) : (
        <>
          <Path d="M9 6h11M9 12h11M9 18h11" {...stroke} strokeLinecap="round" />
          {[6, 12, 18].map((cy) => (
            <Circle key={cy} cx={4.75} cy={cy} r={1} fill={color} />
          ))}
        </>
      )}
    </Svg>
  )
}

/** The view an arrow key moves to: left and right step through the views and wrap. */
export function nextView(current: ProjectsView, key: string): ProjectsView | null {
  if (key !== 'ArrowRight' && key !== 'ArrowLeft' && key !== 'ArrowDown' && key !== 'ArrowUp') {
    return null
  }
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1
  const index = PROJECTS_VIEWS.indexOf(current)
  return PROJECTS_VIEWS[(index + step + PROJECTS_VIEWS.length) % PROJECTS_VIEWS.length] ?? null
}

type Focusable = { focus?: () => void }

/** Grid or list: two icon-only radio buttons, one tab stop, arrow keys move between them. */
export function ProjectsViewToggle({
  value,
  onChange,
}: Readonly<{ value: ProjectsView; onChange: (view: ProjectsView) => void }>) {
  const p = usePalette()
  const s = styles(p)
  const buttons = useRef<Partial<Record<ProjectsView, Focusable | null>>>({})
  const onKey = (event: {
    nativeEvent?: { key?: string }
    key?: string
    preventDefault?: () => void
  }) => {
    const next = nextView(value, event.key ?? event.nativeEvent?.key ?? '')
    if (!next) return
    event.preventDefault?.()
    onChange(next)
    buttons.current[next]?.focus?.()
  }
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="View" style={s.group}>
      {PROJECTS_VIEWS.map((view) => {
        const on = view === value
        return (
          <Pressable
            key={view}
            ref={(node: unknown) => {
              buttons.current[view] = node as Focusable | null
            }}
            accessibilityRole="radio"
            accessibilityLabel={LABEL[view]}
            accessibilityState={{ checked: on }}
            tabIndex={on ? 0 : -1}
            {...({ onKeyDown: onKey } as object)}
            onPress={() => onChange(view)}
            style={[s.button, on && s.active, webPointer]}
          >
            <ViewIcon view={view} color={on ? p.text : p.text3} />
          </Pressable>
        )
      })}
    </View>
  )
}
