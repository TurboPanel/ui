import type { RepositoryAutoDeploy } from '@/lib/instance-api'

/**
 * Whether a push deploys one environment, as one sentence. Two switches
 * decide it: the environment's own Deploy on push, and the repository's
 * auto-deploy, which arms the webhook for every environment. Project Settings
 * and Environment Settings both say it with this, so they never disagree.
 */
export type PushDeployLine = Readonly<{
  /** "Pushes to live deploy production: off (repository auto-deploy is off)" */
  text: string
  on: boolean
  /** What Turn on changes: the repository's switch first, else the environment's; null when nothing is off. */
  turnOn: 'repository' | 'environment' | null
}>

function repositoryWord(autoDeploy: RepositoryAutoDeploy): string {
  if (autoDeploy === 'disabled') return 'off'
  if (autoDeploy === 'checks_passed') return 'on after checks pass'
  return 'on'
}

export function pushDeployLine(
  input: Readonly<{
    environment: string
    /** The branch the environment builds; null when nothing names one. */
    branch: string | null
    deployOnPush: boolean
    /** The repository's auto-deploy; null when the repository is not in the list. */
    autoDeploy: RepositoryAutoDeploy | null
  }>
): PushDeployLine {
  if (input.branch === null) {
    return {
      text: `No branch is set for ${input.environment}, so a push deploys nothing`,
      on: false,
      turnOn: null,
    }
  }
  const repositoryOff = input.autoDeploy === 'disabled'
  const on = input.deployOnPush && !repositoryOff
  const repository =
    input.autoDeploy === null
      ? ''
      : ` (repository auto-deploy is ${repositoryWord(input.autoDeploy)})`
  let turnOn: PushDeployLine['turnOn'] = null
  if (repositoryOff) turnOn = 'repository'
  else if (!input.deployOnPush) turnOn = 'environment'
  return {
    text: `Pushes to ${input.branch} deploy ${input.environment}: ${on ? 'on' : 'off'}${repository}`,
    on,
    turnOn,
  }
}
