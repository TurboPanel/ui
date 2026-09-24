/** UI-facing upgrade step pipeline (matches control-plane `UPGRADE_STEP_STATUSES`). */

export const UPGRADE_STEP_PIPELINE = [
  'preparing',
  'downloading',
  'installing',
  'restarting',
  'verifying',
  'done',
] as const

export type UpgradeStepPipelineId = (typeof UPGRADE_STEP_PIPELINE)[number]

export const UPGRADE_RUN_ACTIVE_STATUSES = ['pending', 'running'] as const

export type UpgradeRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'partially_failed'
  | 'failed'
  | 'cancelled'

export type UpgradePhase = 'colocated_daemon' | 'control_plane' | 'fleet'

export type UpgradeStepStatus =
  | 'pending'
  | 'waiting'
  | 'dispatched'
  | 'preparing'
  | 'downloading'
  | 'installing'
  | 'restarting'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'rolled_back'
  | 'needs_attention'
  | 'skipped'

export const UPDATE_BLOCKED_REASONS = {
  controlPlaneUpgradeRequired: 'control_plane_upgrade_required',
  updatesManaged: 'updates_managed',
} as const
