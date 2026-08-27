import { describe, expect, it } from 'vitest'
import { type NoticePackage } from '../src/lib/notices'
import {
  collectAarPomPackages,
  collectBundledResourcePackages,
  collectGradlePackages,
  hasResolvedNativeGraph,
  inferSpdxFromLicenseText,
  nativeBuildExpected,
  runGenerateNotices,
} from './generate-notices.mjs'

const GRADLE_REPORT = `
releaseRuntimeClasspath - Runtime classpath of compilation 'release' (target  (androidJvm)).
+--- androidx.core:core:1.13.0
|    +--- androidx.annotation:annotation:1.7.0
+--- com.facebook.react:react-android:0.86.2
\\--- org.jetbrains.kotlin:kotlin-stdlib:{strictly 1.9.24} -> 1.9.24 (*)
`

const CORE_POM = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <groupId>androidx.core</groupId>
  <artifactId>core</artifactId>
  <version>1.13.0</version>
  <licenses>
    <license>
      <name>The Apache Software License, Version 2.0</name>
    </license>
  </licenses>
</project>
`

function dirent(name: string, directory = false) {
  return {
    name,
    isDirectory: () => directory,
  }
}

function createMemoryFs(files: Record<string, string>) {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([key, value]) => [key.replaceAll('\\', '/'), value]),
  )
  const exists = (target: string) => {
    const rel = target.replaceAll('\\', '/')
    if (normalized[rel] !== undefined) return true
    return Object.keys(normalized).some(
      (key) => key.startsWith(`${rel}/`) || rel.endsWith(key) || key.endsWith(rel),
    )
  }
  const readFile = (target: string, _encoding?: BufferEncoding) => {
    const rel = target.replaceAll('\\', '/')
    if (normalized[rel] !== undefined) return normalized[rel]
    const hit = Object.entries(normalized).find(([key]) => rel.endsWith(key) || key.endsWith(rel))
    return hit?.[1] ?? ''
  }
  const readdir = (target: string) => {
    const rel = target.replaceAll('\\', '/').replace(/\/$/, '')
    const children = new Map<string, boolean>()
    for (const key of Object.keys(normalized)) {
      if (!key.startsWith(`${rel}/`)) continue
      const rest = key.slice(rel.length + 1)
      const [child, ...more] = rest.split('/')
      if (!child) continue
      children.set(child, more.length > 0)
    }
    return [...children.entries()].map(([name, directory]) => dirent(name, directory))
  }
  return { exists, readFile, readdir }
}

describe('inferSpdxFromLicenseText', () => {
  it('recognizes common license texts used in native trees', () => {
    expect(inferSpdxFromLicenseText('Mozilla Public License 2.0')).toBe('MPL-2.0')
    expect(
      inferSpdxFromLicenseText('Apache License\nVersion 2.0, January 2004'),
    ).toBe('Apache-2.0')
    expect(
      inferSpdxFromLicenseText('Permission is hereby granted, free of charge'),
    ).toBe('MIT')
    expect(inferSpdxFromLicenseText('ISC License')).toBe('ISC')
    expect(inferSpdxFromLicenseText('SIL Open Font License, Version 1.1')).toBe('OFL-1.1')
    expect(inferSpdxFromLicenseText('proprietary blob')).toBeUndefined()
  })
})

describe('Gradle and AAR collection', () => {
  it('parses release Gradle coordinates and AAR/POM license metadata', () => {
    const root = '/tmp/notices-native'
    const files = {
      [`${root}/android/app/releaseRuntimeClasspath.txt`]: GRADLE_REPORT,
      [`${root}/android/libs/androidx.core-core-1.13.0.pom`]: CORE_POM,
      [`${root}/android/libs/androidx.core-core-1.13.0.aar`]: 'aar-bytes',
    }
    const fsApi = {
      ...createMemoryFs(files),
      readGradleReport: () => GRADLE_REPORT,
    }
    const gradle: NoticePackage[] = collectGradlePackages(root, fsApi)
    expect(gradle.map((row) => `${row.name}@${row.version}`)).toEqual([
      'androidx.core:core@1.13.0',
      'androidx.annotation:annotation@1.7.0',
      'com.facebook.react:react-android@0.86.2',
      'org.jetbrains.kotlin:kotlin-stdlib@1.9.24',
    ])
    expect(gradle.every((row) => row.role === 'native' && row.source === 'gradle')).toBe(true)

    const aars: NoticePackage[] = collectAarPomPackages(root, fsApi)
    const core = aars.find((row) => row.name === 'androidx.core:core')
    if (!core) throw new TypeError('expected AAR/POM entry')
    expect(core.version).toBe('1.13.0')
    expect(core.license).toBe('Apache-2.0')
    expect(['pom', 'aar']).toContain(core.source)
    expect(hasResolvedNativeGraph([...gradle, ...aars])).toBe(true)
    const coreGradle = gradle.find((row) => row.name === 'androidx.core:core')
    expect(coreGradle?.license).toBe('Apache-2.0')
  })

  it('resolves non-missing SPDX licenses for a representative Android graph', () => {
    const root = '/tmp/notices-android-licenses'
    const files = {
      [`${root}/android/app/releaseRuntimeClasspath.txt`]: GRADLE_REPORT,
      [`${root}/android/notice-licenses.json`]: JSON.stringify({
        'androidx.annotation:annotation@1.7.0': 'The Apache Software License, Version 2.0',
        'com.facebook.react:react-android@0.86.2': 'MIT License',
        'org.jetbrains.kotlin:kotlin-stdlib@1.9.24': 'Apache License, Version 2.0',
      }),
      [`${root}/gradle-home/caches/modules-2/files-2.1/androidx.core/core/1.13.0/abc/core-1.13.0.pom`]:
        CORE_POM,
    }
    const gradle: NoticePackage[] = collectGradlePackages(root, {
      ...createMemoryFs(files),
      readGradleReport: () => GRADLE_REPORT,
      gradleHome: `${root}/gradle-home`,
    })
    expect(gradle).toHaveLength(4)
    expect(gradle.every((row) => row.license && row.license.length > 0)).toBe(true)
    expect(gradle.every((row) => !row.license.includes(' '))).toBe(true)
    expect(
      gradle.find((row) => row.name === 'androidx.core:core')?.license,
    ).toBe('Apache-2.0')
    expect(
      gradle.find((row) => row.name === 'androidx.annotation:annotation')?.license,
    ).toBe('Apache-2.0')
    expect(
      gradle.find((row) => row.name === 'com.facebook.react:react-android')?.license,
    ).toBe('MIT')
  })
})

describe('bundled resources', () => {
  it('includes committed font OFL files as native bundled-resource entries', () => {
    const root = '/tmp/notices-fonts'
    const files = {
      [`${root}/assets/fonts/OFL-Outfit.txt`]: 'SIL Open Font License Version 1.1',
      [`${root}/assets/fonts/OFL-PlusJakartaSans.txt`]: 'SIL Open Font License Version 1.1',
    }
    const packages: NoticePackage[] = collectBundledResourcePackages(root, createMemoryFs(files))
    expect(packages.map((row) => row.name).sort((a, b) => a.localeCompare(b))).toEqual([
      'Outfit',
      'PlusJakartaSans',
    ])
    expect(packages.every((row) => row.license === 'OFL-1.1')).toBe(true)
    expect(packages.every((row) => row.source === 'bundled-resource')).toBe(true)
    expect(packages.every((row) => row.role === 'native')).toBe(true)
  })
})

describe('native / JS-only checks', () => {
  it('requires a native graph when a native build is expected', () => {
    expect(nativeBuildExpected('/repo', ['--native'], () => false)).toBe(true)
    expect(nativeBuildExpected('/repo', ['--js-only'], () => true)).toBe(false)
    expect(nativeBuildExpected('/repo', [], (target: string) => String(target).endsWith('/ios'))).toBe(
      true,
    )
    expect(hasResolvedNativeGraph([])).toBe(false)
  })

  it('fails --check --native when the generated native graph is absent', () => {
    const errors: string[] = []
    const grouped = {
      MIT: [{ name: 'left-pad', versions: ['1.3.0'], license: 'MIT' }],
    }
    const code = runGenerateNotices({
      root: '/tmp/notices-native-missing',
      argv: ['--check', '--native'],
      io: {
        log: () => {},
        error: (...args: unknown[]) => {
          errors.push(args.map(String).join(' '))
        },
      },
      exit: () => {},
      spawnPnpmLicenses: () => grouped,
      exists: () => false,
      readFile: (_target: string, _encoding?: BufferEncoding) => '',
      writeFile: () => {},
      readdir: () => [],
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('native graph is absent')
  })
})

describe('runGenerateNotices', () => {
  it('succeeds --check --native when Android metadata exists', () => {
    const root = '/tmp/notices-android-check'
    const files = {
      [`${root}/pnpm-lock.yaml`]: 'lockfileVersion: 9.0\n',
      [`${root}/android/app/releaseRuntimeClasspath.txt`]: GRADLE_REPORT,
      [`${root}/android/notice-licenses.json`]: JSON.stringify({
        'androidx.core:core@1.13.0': 'Apache-2.0',
        'androidx.annotation:annotation@1.7.0': 'Apache-2.0',
        'com.facebook.react:react-android@0.86.2': 'MIT',
        'org.jetbrains.kotlin:kotlin-stdlib@1.9.24': 'Apache-2.0',
      }),
    }
    const mem = createMemoryFs(files)
    const noticesPath = `${root}/THIRD_PARTY_NOTICES.md`
    let written = ''
    const grouped = {
      MIT: [{ name: 'left-pad', versions: ['1.3.0'], license: 'MIT' }],
    }
    const shared = {
      root,
      io: { log: () => {}, error: () => {} },
      exit: () => {},
      spawnPnpmLicenses: () => grouped,
      exists: (target: string) => {
        const rel = String(target).replaceAll('\\', '/')
        if (rel === noticesPath) return written.length > 0
        return mem.exists(target)
      },
      readFile: (target: string, encoding?: BufferEncoding) => {
        const rel = String(target).replaceAll('\\', '/')
        if (rel === noticesPath) return written
        return mem.readFile(target, encoding)
      },
      writeFile: (_target: string, contents: string) => {
        written = contents
      },
      readdir: mem.readdir,
      readGradleReport: () => GRADLE_REPORT,
    }
    expect(runGenerateNotices({ ...shared, argv: ['--native'] })).toBe(0)
    expect(written.length).toBeGreaterThan(0)
    expect(written).toContain('androidx.core:core@1.13.0')
    expect(written).toContain('Apache-2.0')
    expect(
      runGenerateNotices({ ...shared, argv: ['--check', '--native'] }),
    ).toBe(0)
  })

  it('classifies lockfile-only JS deps and fails --check when the file is missing', () => {
    const logs: string[] = []
    const errors: string[] = []
    const grouped = {
      MIT: [
        {
          name: 'left-pad',
          versions: ['1.3.0'],
          license: 'MIT',
        },
      ],
    }
    const code = runGenerateNotices({
      root: '/tmp/notices-fixture',
      argv: ['--check', '--js-only'],
      io: {
        log: (...args: unknown[]) => {
          logs.push(args.map(String).join(' '))
        },
        error: (...args: unknown[]) => {
          errors.push(args.map(String).join(' '))
        },
      },
      exit: () => {},
      spawnPnpmLicenses: () => grouped,
      exists: () => false,
      readFile: (_target: string, _encoding?: BufferEncoding) => '',
      writeFile: () => {},
    })
    expect(code).toBe(1)
    expect(errors.join('\n')).toContain('missing THIRD_PARTY_NOTICES.md')
  })
})
