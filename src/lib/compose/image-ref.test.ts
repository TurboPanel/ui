import { describe, expect, it } from 'vitest'
import {
  emptyComposeImageRef,
  formatComposeImageRef,
  looksLikeRegistryHost,
  parseComposeImageRef,
  patchComposeImageRef,
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
    expect(looksLikeRegistryHost('')).toBe(false)
  })
})

describe('emptyComposeImageRef', () => {
  it('returns blank parts', () => {
    expect(emptyComposeImageRef()).toEqual({
      registry: '',
      image: '',
      tag: '',
      digest: '',
    })
  })
})

describe('parseComposeImageRef edge cases', () => {
  it('returns empty parts for non-string or blank input', () => {
    expect(parseComposeImageRef(null)).toEqual(emptyComposeImageRef())
    expect(parseComposeImageRef(42)).toEqual(emptyComposeImageRef())
    expect(parseComposeImageRef('   ')).toEqual(emptyComposeImageRef())
  })

  it('parses image-only and digest-only forms', () => {
    expect(parseComposeImageRef('nginx')).toEqual({
      registry: '',
      image: 'nginx',
      tag: '',
      digest: '',
    })
    expect(
      parseComposeImageRef('@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'),
    ).toEqual({
      registry: '',
      image: '',
      tag: '',
      digest:
        'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    })
  })

  it('treats library paths without a registry host as repository paths', () => {
    expect(parseComposeImageRef('library/nginx')).toEqual({
      registry: '',
      image: 'library/nginx',
      tag: '',
      digest: '',
    })
    expect(parseComposeImageRef('org/app:stable')).toEqual({
      registry: '',
      image: 'org/app',
      tag: 'stable',
      digest: '',
    })
  })
})

describe('formatComposeImageRef edge cases', () => {
  it('returns empty string when image is blank', () => {
    expect(
      formatComposeImageRef({
        registry: 'ghcr.io',
        image: '  ',
        tag: 'latest',
        digest: 'sha256:abc',
      }),
    ).toBe('')
  })

  it('includes digest without requiring a tag', () => {
    expect(
      formatComposeImageRef({
        registry: '',
        image: 'nginx',
        tag: '',
        digest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      }),
    ).toBe(
      'nginx@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    )
  })
})

describe('patchComposeImageRef', () => {
  it('merges partial updates', () => {
    const current = parseComposeImageRef('ghcr.io/org/app:1.0')
    expect(patchComposeImageRef(current, { tag: '2.0' })).toEqual({
      registry: 'ghcr.io',
      image: 'org/app',
      tag: '2.0',
      digest: '',
    })
    expect(patchComposeImageRef(current, { registry: '', image: 'nginx' })).toEqual({
      registry: '',
      image: 'nginx',
      tag: '1.0',
      digest: '',
    })
  })
})
