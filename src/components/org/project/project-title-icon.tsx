import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { PlatformShieldIcon } from '@/components/org/platform-badge'
import type { ProjectRecord } from '@/lib/instance-api'
import { SYSTEM_PROJECT_METADATA_TYPE } from '@/lib/system-inventory'
import { chrome } from '@/lib/theme'

type ProjectType = NonNullable<ProjectRecord['metadata']>['type']

type IconProps = Readonly<{
  size?: number
  color: string
}>

/**
 * Cube / package — compose & template projects.
 * Layers are reserved for environment scope chips.
 */
function ComposeProjectGlyph({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 7.5 12 2.25 3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** Cylinder — managed database projects. */
function ManagedProjectGlyph({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3-3.358-3-7.5-3-7.5 1.343-7.5 3Z"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 6.75v10.5c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3V6.75"
        stroke={color}
        strokeWidth={1.75}
      />
      <Path
        d="M4.5 12c0 1.657 3.358 3 7.5 3s7.5-1.343 7.5-3"
        stroke={color}
        strokeWidth={1.75}
      />
    </Svg>
  )
}

/** Open folder — projects still in setup. */
function SetupProjectGlyph({ size = 18, color }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.75 7.5A1.5 1.5 0 0 1 5.25 6h4.19c.4 0 .78.16 1.06.44L12 7.94h6.75A1.5 1.5 0 0 1 20.25 9.44v7.06a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5V7.5Z"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function accessibilityLabelForType(type: ProjectType | undefined): string {
  if (type === 'managed') return 'Managed project'
  if (type === 'template') return 'Template project'
  if (type === 'docker-compose') return 'Compose project'
  if (type === SYSTEM_PROJECT_METADATA_TYPE) return 'Platform project'
  return 'Project setup'
}

function ProjectTypeGlyph({
  type,
  size,
  color,
}: Readonly<{
  type: ProjectType | undefined
  size: number
  color: string
}>) {
  if (type === 'managed') {
    return <ManagedProjectGlyph size={size} color={color} />
  }
  if (type === 'docker-compose' || type === 'template') {
    return <ComposeProjectGlyph size={size} color={color} />
  }
  if (type === SYSTEM_PROJECT_METADATA_TYPE) {
    return <PlatformShieldIcon size={size} color={color} />
  }
  return <SetupProjectGlyph size={size} color={color} />
}

/**
 * Bare type glyph beside the project title — cube (compose), DB (managed),
 * shield (platform), or folder (setup). Layers are reserved for environments.
 * Never emoji.
 */
export function ProjectTitleIcon({
  project,
  compact = false,
}: Readonly<{
  project: ProjectRecord
  /** Slightly smaller glyph for breadcrumb title rows. */
  compact?: boolean
}>) {
  const type = project.metadata?.type
  const label = accessibilityLabelForType(type)
  const glyphSize = compact ? 18 : 22

  return (
    <View
      style={styles.icon}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <ProjectTypeGlyph type={type} size={glyphSize} color={chrome.accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  icon: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
