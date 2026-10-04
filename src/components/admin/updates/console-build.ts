import Constants from 'expo-constants'
import type { ConsoleBuild } from '@/lib/instance-updates'
import { readAppSourceRelease } from '@/lib/source-release'

/** This console's own build (the bundle the control plane serves), from the app config. */
export function readConsoleBuild(): ConsoleBuild | null {
  try {
    const release = readAppSourceRelease(Constants.expoConfig)
    return { version: release.version, commit: release.gitCommit }
  } catch {
    return null
  }
}
