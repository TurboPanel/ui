import { describe, expect, it, vi } from 'vitest'
import type { InstanceUpdates, UpgradeRunRecord, UpgradeStepRow } from '@/lib/instance-api'
import {
  DAEMON_LOGS_COMMAND,
  daemonReinstallCommand,
  installerHostForChannel,
  explainUpgradeFailure,
  readDismissedUpdateBanner,
  runFailure,
  runToShow,
  stallHint,
  UPGRADE_DOCS_URL,
  UpgradeStartTimeoutError,
  updateBanner,
  updateOffered,
  withStartTimeout,
  writeDismissedUpdateBanner,
} from '@/lib/update-status'

type RunWithSteps = UpgradeRunRecord & { steps: UpgradeStepRow[] }

function step(overrides: Partial<UpgradeStepRow> = {}): UpgradeStepRow {
  return {
    id: 'step-1',
    serverId: 'server-1',
    unit: 'daemon',
    phase: 'colocated_daemon',
    batchIndex: 0,
    status: 'dispatched',
    ...overrides,
  }
}

function run(overrides: Partial<RunWithSteps> = {}): RunWithSteps {
  return {
    id: 'run-1',
    status: 'running',
    phase: 'colocated_daemon',
    channel: 'canary',
    source: 'manual',
    steps: [step()],
    ...overrides,
  }
}

const SIGNATURE_MESSAGE =
  'preflight_manifest: channel manifest signature is invalid (keyId c72c6744)'

describe('explainUpgradeFailure', () => {
  it('never quotes raw network text back to the operator', () => {
    const explained = explainUpgradeFailure({
      errorCode: 'rolled_back',
      errorMessage: 'Get "https://x": dial tcp 10.0.0.4:443: connection refused',
    })
    expect(explained.body).not.toMatch(/dial tcp|refused/)
    expect(explained.body).toContain('A network problem interrupted this step')
    expect(
      explainUpgradeFailure({ errorCode: 'x', errorMessage: 'TypeError: Failed to fetch' }).body
    ).toBe('A network problem interrupted this step, so it could not finish. Try the update again.')
  })

  it('tells an old daemon to reinstall once for a bad signature', () => {
    const explained = explainUpgradeFailure({
      errorCode: 'preflight_manifest',
      errorMessage: SIGNATURE_MESSAGE,
    })
    expect(explained.title).toBe("Can't verify the new release")
    expect(explained.body).toContain("can't verify the new release's signature")
    expect(explained.body).toContain('Reinstall the daemon once')
    expect(explained.command).toBe(daemonReinstallCommand())
    expect(explained.docsUrl).toBe(UPGRADE_DOCS_URL)
  })

  it('reads other manifest failures without the reinstall advice', () => {
    const explained = explainUpgradeFailure({
      errorCode: 'preflight_manifest',
      errorMessage: 'manifest fetch returned 404',
    })
    expect(explained.title).toBe("Couldn't read the release manifest")
    expect(explained.body).toContain('manifest fetch returned 404')
    expect(explained.command).toBeNull()
  })

  it.each([
    ['preflight_disk', 'Not enough disk space', null],
    ['preflight_in_progress', 'Another update is already running', null],
    ['step_timeout', 'The server stopped reporting progress', DAEMON_LOGS_COMMAND],
    ['server_offline', 'The server was offline and was skipped', null],
    ['dispatch_failed', "The update couldn't reach the server", null],
    ['rolled_back', 'Rolled back to the previous build', DAEMON_LOGS_COMMAND],
    ['update_rollback', 'Rolled back to the previous build', DAEMON_LOGS_COMMAND],
  ])('explains %s', (code, title, command) => {
    const explained = explainUpgradeFailure({ errorCode: code })
    expect(explained.title).toBe(title)
    expect(explained.command).toBe(command)
  })

  it('includes a rollback reason when the daemon sent one', () => {
    expect(
      explainUpgradeFailure({ errorCode: 'rolled_back', errorMessage: 'health check timed out' })
        .body
    ).toContain('Reason: health check timed out')
  })

  it('falls back to the message, then the code, then a generic line', () => {
    expect(explainUpgradeFailure({ errorCode: 'odd', errorMessage: ' disk exploded ' }).body).toBe(
      'disk exploded'
    )
    expect(explainUpgradeFailure({ errorCode: 'odd' }).body).toBe('Reason code: odd')
    expect(explainUpgradeFailure({}).body).toBe('No reason was reported.')
    expect(explainUpgradeFailure({}).title).toBe('The update failed')
  })
})

describe('explainUpgradeFailure for the control plane step', () => {
  it('names a web server that did not start and gives the one command', () => {
    const explained = explainUpgradeFailure({ errorCode: 'web_server_failed' })
    expect(explained.title).toBe('The web server did not start')
    expect(explained.command).toBe('sudo systemctl restart turbopanel-caddy')
  })

  it('leads with the plain fact for recovery_required and says to check health first', () => {
    const explained = explainUpgradeFailure({
      errorCode: 'recovery_required',
      errorMessage: 'recovery_required: rollback ...',
    })
    expect(explained.title).toBe('The previous build could not be confirmed')
    expect(explained.body).toContain('Check whether the control plane is answering')
  })
})

describe('runToShow', () => {
  it('prefers the active run', () => {
    const active = run()
    expect(runToShow({ run: active, lastRun: run({ id: 'old', status: 'failed' }) })).toEqual({
      run: active,
      finished: false,
    })
  })

  it('keeps a failed last run on screen', () => {
    const failed = run({ status: 'failed' })
    expect(runToShow({ run: null, lastRun: failed })).toEqual({ run: failed, finished: true })
    const partial = run({ status: 'partially_failed' })
    expect(runToShow({ run: null, lastRun: partial }).run).toBe(partial)
  })

  it('does not redraw a successful last run, or nothing at all', () => {
    expect(runToShow({ run: null, lastRun: run({ status: 'succeeded' }) }).run).toBeNull()
    expect(runToShow({ run: null }).run).toBeNull()
    expect(runToShow(undefined).run).toBeNull()
  })
})

describe('runToShow with the running build', () => {
  const failedPlane = (toCommit: string) =>
    run({
      status: 'failed',
      steps: [
        step({
          phase: 'control_plane',
          unit: 'instance',
          status: 'failed',
          toCommit,
          toVersion: '0.1.5',
        }),
      ],
    })

  it('hides a failed control-plane run whose target build is running', () => {
    expect(runToShow({ run: null, lastRun: failedPlane('abc') }, { commit: 'abc' }).run).toBeNull()
    expect(
      runToShow({ run: null, lastRun: failedPlane('abc') }, { version: '0.1.5' }).run
    ).toBeNull()
  })

  it('keeps it when another build is running or nothing is known', () => {
    const failed = failedPlane('abc')
    expect(runToShow({ run: null, lastRun: failed }, { commit: 'zzz' }).run).toBe(failed)
    expect(runToShow({ run: null, lastRun: failed }, {}).run).toBe(failed)
    expect(runToShow({ run: null, lastRun: failed }).run).toBe(failed)
  })

  it('keeps a failure that is not only the control plane', () => {
    const mixed = run({
      status: 'partially_failed',
      steps: [
        step({ phase: 'control_plane', unit: 'instance', status: 'failed', toCommit: 'abc' }),
        step({ id: 's2', phase: 'fleet', status: 'failed', toCommit: 'abc' }),
      ],
    })
    expect(runToShow({ run: null, lastRun: mixed }, { commit: 'abc' }).run).toBe(mixed)
  })
})

describe('runFailure', () => {
  it('explains the first failed step with its phase', () => {
    const failure = runFailure(
      run({
        status: 'failed',
        steps: [
          step({
            status: 'failed',
            errorCode: 'preflight_manifest',
            errorMessage: SIGNATURE_MESSAGE,
          }),
          step({ id: 'cp', phase: 'control_plane', unit: 'instance', status: 'pending' }),
        ],
      })
    )
    expect(failure?.stepTitle).toBe('Daemon step')
    expect(failure?.command).toBe(daemonReinstallCommand('canary'))
  })

  it('names control-plane and server steps', () => {
    expect(
      runFailure(run({ steps: [step({ phase: 'control_plane', status: 'rolled_back' })] }))
        ?.stepTitle
    ).toBe('Control plane step')
    expect(
      runFailure(
        run({ steps: [step({ phase: 'fleet', status: 'needs_attention', serverName: 'kore' })] })
      )?.stepTitle
    ).toBe('kore')
    expect(
      runFailure(run({ steps: [step({ phase: 'fleet', status: 'failed', hostname: 'kore.lan' })] }))
        ?.stepTitle
    ).toBe('kore.lan')
    expect(
      runFailure(run({ steps: [step({ phase: 'fleet', status: 'failed' })] }))?.stepTitle
    ).toBe('Server')
  })

  it('reads a failed run with no failed step from the run error', () => {
    const failure = runFailure(run({ status: 'failed', error: 'step_timeout', steps: [] }))
    expect(failure?.title).toBe('The server stopped reporting progress')
    expect(failure?.stepTitle).toBe('Update')
  })

  it('says a cancelled run was cancelled', () => {
    expect(runFailure(run({ status: 'cancelled', steps: [] }))?.title).toBe(
      'The update was cancelled'
    )
  })

  it('has nothing to say for a healthy or missing run', () => {
    expect(runFailure(run())).toBeNull()
    expect(runFailure(null)).toBeNull()
  })
})

describe('stallHint', () => {
  const at = '2026-09-27T18:00:00.000Z'
  const base = Date.parse(at)

  it('stays quiet while the step is moving', () => {
    expect(stallHint({ status: 'downloading', lastStageAt: at }, base + 4 * 60_000)).toBeNull()
  })

  it('says how long it has been quiet after five minutes', () => {
    const hint = stallHint({ status: 'dispatched', lastStageAt: at }, base + 7 * 60_000)
    expect(hint).toContain('no progress reported for 7 minutes')
    expect(hint).toContain(DAEMON_LOGS_COMMAND)
  })

  it('ignores finished steps and steps without a timestamp', () => {
    expect(stallHint({ status: 'failed', lastStageAt: at }, base + 60 * 60_000)).toBeNull()
    expect(stallHint({ status: 'dispatched', lastStageAt: null }, base)).toBeNull()
    expect(stallHint({ status: 'dispatched', lastStageAt: 'not a date' }, base)).toBeNull()
    expect(stallHint(null, base)).toBeNull()
  })
})

describe('withStartTimeout', () => {
  it('passes a prompt answer through', async () => {
    await expect(withStartTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('gives up on a request that never answers', async () => {
    vi.useFakeTimers()
    try {
      const pending = withStartTimeout(new Promise<never>(() => {}), 30_000)
      const assertion = expect(pending).rejects.toBeInstanceOf(UpgradeStartTimeoutError)
      await vi.advanceTimersByTimeAsync(30_000)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})

function updates(overrides: Partial<InstanceUpdates> = {}): InstanceUpdates {
  const target = {
    commit: 'abc1234def',
    buildId: '20260927-180000-abc1234',
    builtAt: '',
    channel: 'canary',
    manifestUrl: 'https://example.test/manifest.json',
    version: '0.1.2',
  }
  return {
    ok: true,
    channel: 'canary',
    runtime: 'deno',
    units: {
      instance: {
        installed: { version: '0.1.1', commit: 'old' },
        target,
        uiTarget: null,
        updateAvailable: true,
      },
      daemon: {
        installed: { version: '0.1.1', commit: 'old' },
        target,
        serverId: 'server-1',
        connected: true,
        updateAvailable: false,
      },
    },
    ...overrides,
  }
}

function build(version: string, commit: string) {
  return {
    commit,
    buildId: `build-${commit}`,
    builtAt: '2026-09-30T14:30:00.000Z',
    channel: 'canary',
    manifestUrl: 'https://example.test/manifest.json',
    version,
  }
}

/** Control plane on 0.1.5-canary.1, UI on 0.1.5-canary.2, daemon on 0.1.6-canary.3; all three have updates. */
function allThree(): InstanceUpdates {
  const data = updates()
  data.units.instance.target = build('0.1.5-canary.1', 'cp11111')
  data.units.instance.uiTarget = build('0.1.5-canary.2', 'ui22222')
  data.units.daemon.target = build('0.1.6-canary.3', 'dm33333')
  data.units.daemon.updateAvailable = true
  return data
}

const OLD_CONSOLE = { version: '0.1.4', commit: 'ui00000' }

describe('updateBanner', () => {
  it('offers an available self-hosted update, naming the piece and its version', () => {
    const banner = updateBanner({ updates: updates(), activeRun: false, dismissedKey: null })
    expect(banner?.title).toBe('Update available: control plane v0.1.2')
    expect(banner?.body).toBe('Updates the control plane together.')
    expect(banner?.key).toBe('control plane|canary|0.1.2|abc1234def|20260927-180000-abc1234')
  })

  it('names every piece with an update in the order control plane, UI, daemon', () => {
    const banner = updateBanner({
      updates: allThree(),
      activeRun: false,
      dismissedKey: null,
      consoleBuild: OLD_CONSOLE,
    })
    expect(banner?.title).toBe(
      'Update available: control plane v0.1.5-canary.1, web app v0.1.5-canary.2, daemon v0.1.6-canary.3'
    )
    expect(banner?.body).toBe(
      'Updates the control plane, the web app and the daemon on every server together.'
    )
  })

  it('names the daemon alone when only it has an update', () => {
    const data = allThree()
    data.units.instance.updateAvailable = false
    const banner = updateBanner({ updates: data, activeRun: false, dismissedKey: null })
    expect(banner?.title).toBe('Update available: daemon v0.1.6-canary.3')
    expect(banner?.body).toBe('Updates the daemon on every server together.')
  })

  it('lists the web app only when this app differs from the one the channel serves', () => {
    const data = allThree()
    const current = { version: '0.1.5', commit: 'ui22222' }
    expect(
      updateBanner({ updates: data, activeRun: false, dismissedKey: null, consoleBuild: current })
        ?.title
    ).toBe('Update available: control plane v0.1.5-canary.1, daemon v0.1.6-canary.3')
    expect(updateBanner({ updates: data, activeRun: false, dismissedKey: null })?.title).toBe(
      'Update available: control plane v0.1.5-canary.1, daemon v0.1.6-canary.3'
    )
  })

  it('leaves out a daemon that is not connected', () => {
    const data = allThree()
    data.units.daemon.connected = false
    expect(updateBanner({ updates: data, activeRun: false, dismissedKey: null })?.title).toBe(
      'Update available: control plane v0.1.5-canary.1'
    )
  })

  it('stays hidden when dismissed for these builds, during a run, on Workers, or with nothing new', () => {
    const offered = updateBanner({ updates: updates(), activeRun: false, dismissedKey: null })
    expect(
      updateBanner({ updates: updates(), activeRun: false, dismissedKey: offered?.key ?? '' })
    ).toBeNull()
    expect(updateBanner({ updates: updates(), activeRun: true, dismissedKey: null })).toBeNull()
    expect(
      updateBanner({
        updates: updates({ runtime: 'workers' }),
        activeRun: false,
        dismissedKey: null,
      })
    ).toBeNull()
    expect(
      updateBanner({
        updates: updates({ updatesManaged: true }),
        activeRun: false,
        dismissedKey: null,
      })
    ).toBeNull()
    const current = updates()
    current.units.instance.updateAvailable = false
    expect(updateBanner({ updates: current, activeRun: false, dismissedKey: null })).toBeNull()
    expect(updateBanner({ updates: null, activeRun: false, dismissedKey: null })).toBeNull()
  })

  it('comes back for a newer build after an older one was dismissed', () => {
    expect(
      updateBanner({ updates: updates(), activeRun: false, dismissedKey: 'canary|0.1.1|old|x' })
    ).not.toBeNull()
  })

  it('comes back when a new build of any one listed piece arrives', () => {
    const input = { activeRun: false, consoleBuild: OLD_CONSOLE }
    const dismissed = updateBanner({ ...input, updates: allThree(), dismissedKey: null })?.key ?? ''
    expect(updateBanner({ ...input, updates: allThree(), dismissedKey: dismissed })).toBeNull()
    const newerDaemon = allThree()
    newerDaemon.units.daemon.target = build('0.1.6-canary.4', 'dm44444')
    expect(updateBanner({ ...input, updates: newerDaemon, dismissedKey: dismissed })?.title).toBe(
      'Update available: control plane v0.1.5-canary.1, web app v0.1.5-canary.2, daemon v0.1.6-canary.4'
    )
    const newerUi = allThree()
    newerUi.units.instance.uiTarget = build('0.1.5-canary.3', 'ui33333')
    expect(updateBanner({ ...input, updates: newerUi, dismissedKey: dismissed })).not.toBeNull()
  })

  it('needs a target to name', () => {
    const noTarget = updates()
    noTarget.units.instance.target = null
    noTarget.units.daemon.target = null
    noTarget.units.daemon.updateAvailable = true
    expect(updateBanner({ updates: noTarget, activeRun: false, dismissedKey: null })).toBeNull()
  })
})

describe('updateOffered (the admin sidebar badge)', () => {
  it('is on whenever the control plane or its daemon has an update to name', () => {
    expect(updateOffered({ updates: updates(), activeRun: false })).toBe(true)
    const disconnected = allThree()
    disconnected.units.instance.updateAvailable = false
    disconnected.units.daemon.connected = false
    expect(updateOffered({ updates: disconnected, activeRun: false })).toBe(true)
  })

  it('is off during a run, on Workers, with nothing new, or with no target', () => {
    expect(updateOffered({ updates: updates(), activeRun: true })).toBe(false)
    expect(updateOffered({ updates: updates({ runtime: 'workers' }), activeRun: false })).toBe(
      false
    )
    expect(updateOffered({ updates: null, activeRun: false })).toBe(false)
    const current = updates()
    current.units.instance.updateAvailable = false
    expect(updateOffered({ updates: current, activeRun: false })).toBe(false)
    const uiOnly = allThree()
    uiOnly.units.instance.updateAvailable = false
    uiOnly.units.daemon.updateAvailable = false
    expect(updateOffered({ updates: uiOnly, activeRun: false })).toBe(false)
    // The console running an older UI than the channel serves is an offer by itself.
    expect(updateOffered({ updates: uiOnly, activeRun: false, consoleBuild: OLD_CONSOLE })).toBe(
      true
    )
    const noTarget = updates()
    noTarget.units.instance.target = null
    noTarget.units.daemon.target = null
    expect(updateOffered({ updates: noTarget, activeRun: false })).toBe(false)
  })
})

describe('dismissed banner storage', () => {
  it('round-trips through storage', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
    }
    expect(readDismissedUpdateBanner(storage)).toBeNull()
    writeDismissedUpdateBanner(storage, 'k1')
    expect(readDismissedUpdateBanner(storage)).toBe('k1')
  })

  it('survives missing or throwing storage', () => {
    expect(readDismissedUpdateBanner(undefined)).toBeNull()
    const throwing = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readDismissedUpdateBanner(throwing)).toBeNull()
    expect(() => writeDismissedUpdateBanner(throwing, 'k')).not.toThrow()
  })
})

describe('installer host per channel', () => {
  it('sends rc to staging, the canary rail to testing and a release to the bare host', () => {
    expect(installerHostForChannel('rc')).toBe('staging.turbopanel.sh')
    for (const channel of ['trunk', 'edge', 'canary']) {
      expect(installerHostForChannel(channel)).toBe('testing.turbopanel.sh')
    }
    expect(installerHostForChannel('release')).toBe('turbopanel.sh')
    expect(installerHostForChannel(null)).toBe('turbopanel.sh')
    expect(daemonReinstallCommand('rc')).toBe(
      'curl -fsSL staging.turbopanel.sh | TURBOPANEL_DAEMON_ONLY=1 sh'
    )
  })
})
