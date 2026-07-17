import { describe, expect, it } from 'vitest'
import {
  formatComposeImageRef,
  looksLikeRegistryHost,
  parseComposeImageRef,
} from './image-ref'

describe('parseComposeImageRef', () => {
  it('splits Docker Hub image and tag', () => {
    expect(parseComposeImageRef('nginx:alpine')).toEqual({
      registry: '',
      image: 'nginx',
      tag: 'alpine',
      digest: '',
    })
    expect(parseComposeImageRef('library/nginx:1.27')).toEqual({
      registry: '',
      image: 'library/nginx',
      tag: '1.27',
      digest: '',
    })
  })

  it('parses alternate registries including host:port', () => {
    expect(parseComposeImageRef('ghcr.io/org/app:1.2.3')).toEqual({
      registry: 'ghcr.io',
      image: 'org/app',
      tag: '1.2.3',
      digest: '',
    })
    expect(parseComposeImageRef('quay.io/prometheus/node-exporter:v1')).toEqual({
      registry: 'quay.io',
      image: 'prometheus/node-exporter',
      tag: 'v1',
      digest: '',
    })
    expect(parseComposeImageRef('localhost:5000/myapp:dev')).toEqual({
      registry: 'localhost:5000',
      image: 'myapp',
      tag: 'dev',
      digest: '',
    })
    expect(parseComposeImageRef('registry.example.com:5000/team/api:latest')).toEqual({
      registry: 'registry.example.com:5000',
      image: 'team/api',
      tag: 'latest',
      digest: '',
    })
  })

  it('preserves digests', () => {
    expect(
      parseComposeImageRef(
        'nginx@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      ),
    ).toEqual({
      registry: '',
      image: 'nginx',
      tag: '',
      digest:
        'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    expect(
      parseComposeImageRef(
        'ghcr.io/org/app:1@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
    ).toEqual({
      registry: 'ghcr.io',
      image: 'org/app',
      tag: '1',
      digest:
        'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    })
  })

  it('treats docker.io as an explicit registry host', () => {
    expect(parseComposeImageRef('docker.io/library/nginx:latest')).toEqual({
      registry: 'docker.io',
      image: 'library/nginx',
      tag: 'latest',
      digest: '',
    })
  })
})

describe('formatComposeImageRef', () => {
  it('round-trips common forms', () => {
    const samples = [
      'nginx:alpine',
      'library/nginx:1.27',
      'ghcr.io/org/app:1.2.3',
      'localhost:5000/myapp:dev',
      'registry.example.com:5000/team/api:latest',
      'nginx@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'ghcr.io/org/app:1@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    ]
    for (const sample of samples) {
      expect(formatComposeImageRef(parseComposeImageRef(sample))).toBe(sample)
    }
  })

  it('omits empty registry and tag', () => {
    expect(
      formatComposeImageRef({
        registry: '',
        image: 'nginx',
        tag: '',
        digest: '',
      }),
    ).toBe('nginx')
    expect(
      formatComposeImageRef({
        registry: '  ',
        image: ' nginx ',
        tag: ' alpine ',
        digest: '',
      }),
    ).toBe('nginx:alpine')
  })
})

describe('looksLikeRegistryHost', () => {
  it('matches domain / localhost / port forms', () => {
    expect(looksLikeRegistryHost('ghcr.io')).toBe(true)
    expect(looksLikeRegistryHost('localhost')).toBe(true)
    expect(looksLikeRegistryHost('localhost:5000')).toBe(true)
    expect(looksLikeRegistryHost('library')).toBe(false)
    expect(looksLikeRegistryHost('nginx')).toBe(false)
  })
})
