import { Platform } from 'react-native'
import {
  readBrowserLocationOrigin,
  setControlPlaneEnvReader,
} from '@/lib/control-plane'

setControlPlaneEnvReader(() => ({
  platformOS: Platform.OS,
  isDev: typeof __DEV__ !== 'undefined' && __DEV__,
  locationOrigin: readBrowserLocationOrigin(),
}))
