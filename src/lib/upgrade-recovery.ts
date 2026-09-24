/** A rollback command that names a real attempt, not the placeholder `pending`. */
export function isRunnableRecoveryCommand(command: string): boolean {
  if (command.includes('pending') || command.includes('<upgrade id>')) return false
  return command.trim().length > 0
}

/** The command the operator copied still names this attempt after a restart. */
export function recoveryCommandNamesAttempt(command: string, runId: string): boolean {
  const id = runId.trim()
  if (!id || id === 'pending') return false
  return command.includes(`turbopanel_upgrade_id=${id}`)
}
