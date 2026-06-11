import { defaultConfig } from '@tamagui/config/v5'
import { animations as animationsCSS } from '@tamagui/config/v5-css'
import { animations as animationsReanimated } from '@tamagui/config/v5-reanimated'
import { createTamagui, isWeb } from 'tamagui'

// Use default config for now - italic support will be added via font face mappings
// when fonts are loaded in the app. On web, fontStyle="italic" works natively.
// For React Native, we'll handle italic fonts via the face property in font loading.
// Platform-split animations: CSS on web, Reanimated on native.
const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations: isWeb ? animationsCSS : animationsReanimated,
})

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

export default tamaguiConfig
