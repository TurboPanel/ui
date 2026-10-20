import type { ReactNode } from 'react'
import { View } from 'react-native'
import { Notice } from '@/components/ui/v4/notice'
import { BASE_EDIT_WARNING } from '@/lib/v4/primary-environment'

/**
 * The line that frames every Base screen: the Base is the shared defaults for
 * all environments, and it is the only place a change reaches all of them.
 */
export function BaseEditNotice() {
  return (
    <Notice tone="warn" title="Shared defaults for all environments" body={BASE_EDIT_WARNING} />
  )
}

/** A Base screen with the shared-defaults line above it. */
export function WithBaseNotice({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <View style={{ width: '100%', gap: 16 }}>
      <BaseEditNotice />
      {children}
    </View>
  )
}
