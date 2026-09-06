import { describe, expect, it } from 'vitest'
import { serviceNameFromCommand } from '@/lib/docker-run-import'

describe('serviceNameFromCommand', () => {
  it('takes the image repository, not the registry or the tag', () => {
    expect(serviceNameFromCommand('docker run ghcr.io/acme/web-api:1.2')).toBe(
      'web-api',
    )
    expect(serviceNameFromCommand('docker run nginx:alpine')).toBe('nginx')
    expect(serviceNameFromCommand('docker run nginx@sha256:abc')).toBe('nginx')
  })

  it('skips the command prefix and boolean flags before the image', () => {
    expect(
      serviceNameFromCommand('sudo docker container run -d -it redis:7'),
    ).toBe('redis')
  })

  it('is empty when there is no image to name a service after', () => {
    expect(serviceNameFromCommand('')).toBe('')
    expect(serviceNameFromCommand('docker run')).toBe('')
    expect(serviceNameFromCommand('   ')).toBe('')
  })

  it('is empty when the remaining token is not a usable image repository', () => {
    expect(serviceNameFromCommand('docker run :')).toBe('')
    expect(serviceNameFromCommand('docker run @sha256:dead')).toBe('')
    expect(serviceNameFromCommand('docker run ///')).toBe('')
  })

  it('sanitizes characters that are not legal in a compose service name', () => {
    expect(serviceNameFromCommand('docker run acme/web+api')).toBe('web-api')
  })
})
