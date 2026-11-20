import { useSyncExternalStore } from 'react'
import { stepUpBroker } from '@/lib/step-up'

/** True while the confirm-it-is-you prompt is open (a request is waiting on the person). */
export function useStepUpOpen(): boolean {
  return useSyncExternalStore(stepUpBroker.watch, stepUpBroker.isOpen, () => false)
}
