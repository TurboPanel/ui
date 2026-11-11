import { describe, expect, it } from 'vitest'
import {
  commandLines,
  emptyWorkerRow,
  lifecycleFieldsFrom,
  lifecycleFormFrom,
  storedLifecycleFields,
} from './php-site-lifecycle'

describe('php site lifecycle form', () => {
  it('reads stored options into form text and back', () => {
    const options = {
      postDeployCommands: ['php artisan migrate --force', 'php artisan cache:clear'],
      postDeployTimeoutSeconds: 120,
      postDeployTiming: 'after-switch' as const,
      workers: [
        { name: 'queue', command: 'php artisan queue:work', processes: 3, memoryMb: 512 },
        { name: 'mail', command: 'php artisan mail:work', enabled: false },
      ],
    }
    const form = lifecycleFormFrom(options)
    expect(form.commands).toBe('php artisan migrate --force\nphp artisan cache:clear')
    expect(form.workers[1]?.enabled).toBe(false)
    expect(lifecycleFieldsFrom(form)).toEqual({ fields: options })
  })

  it('sends only what is set, and the default timing is left out', () => {
    expect(lifecycleFieldsFrom(lifecycleFormFrom({}))).toEqual({ fields: {} })
  })

  it('splits commands one per line and drops blank lines', () => {
    expect(commandLines('  a b \r\n\n c\n')).toEqual(['a b', 'c'])
  })

  it('refuses a number that is not whole, naming the worker', () => {
    const form = lifecycleFormFrom({})
    form.workers = [{ ...emptyWorkerRow('k'), name: 'queue', command: 'x', processes: '2x' }]
    expect(lifecycleFieldsFrom(form)).toEqual({
      error: 'Worker "queue": the process count must be a whole number.',
    })
    form.workers = []
    form.timeoutSeconds = '1.5'
    expect(lifecycleFieldsFrom(form)).toHaveProperty('error')
  })

  it('leaves out-of-range numbers for the control plane to answer', () => {
    const form = lifecycleFormFrom({})
    form.timeoutSeconds = '5'
    expect(lifecycleFieldsFrom(form)).toEqual({ fields: { postDeployTimeoutSeconds: 5 } })
  })

  it('carries stored fields through while the section is hidden', () => {
    expect(storedLifecycleFields({ postDeployCommands: ['a'], workers: [] })).toEqual({
      postDeployCommands: ['a'],
      workers: [],
    })
    expect(storedLifecycleFields({})).toEqual({})
  })
})
