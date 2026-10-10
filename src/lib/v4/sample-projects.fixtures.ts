/**
 * The four sample projects of the v4 mockup (turbopanel-website, acme-blog,
 * client-portal, example-api), as typed fixtures for the v4 logic tests.
 */

import { environmentChanges, environmentValues } from './effective-config'
import {
  defaultLinuxUser,
  linuxUserFromDeclared,
  resolveRunsAs,
  type EnvironmentView,
  type LinuxUser,
} from './linux-users'
import type { MapDomain, MapInput, MapLink, MapMode, MapVolume } from './map-layout'
import type { EnvConfigSource, FlatConfig, V4Service } from './types'

export type SampleEnvironment = Readonly<{
  id: string
  name: string
  source: EnvConfigSource
  domains: readonly MapDomain[]
  volumes: readonly MapVolume[]
}>

export type SampleProject = Readonly<{
  id: string
  name: string
  services: readonly V4Service[]
  base: FlatConfig
  users: readonly LinuxUser[]
  links: readonly MapLink[]
  environments: readonly SampleEnvironment[]
}>

const secure = { key: 'ok', label: 'Secure' } as const

const nodeRows = (id: string, user: string): FlatConfig => ({
  [`svc:${id}:start`]: 'Built-in server (recommended)',
  [`svc:${id}:build`]: 'pnpm build',
  [`svc:${id}:node`]: 'Node 26',
  [`svc:${id}:restarts`]: 'Up to 10 times',
  [`svc:${id}:root`]: 'Top folder',
  [`svc:${id}:runsAs`]: user,
})

const siteRows = (id: string, user: string): FlatConfig => ({
  [`svc:${id}:webserver`]: 'nginx',
  [`svc:${id}:php`]: 'PHP 8.3',
  [`svc:${id}:mode`]: 'php-fpm',
  [`svc:${id}:docroot`]: 'public',
  [`svc:${id}:start`]: 'Default',
  [`svc:${id}:runsAs`]: user,
})

const website: SampleProject = {
  id: 'website',
  name: 'turbopanel-website',
  services: [{ id: 'web', name: 'web', kind: 'node', web: true }],
  base: {
    ...nodeRows('web', 'website'),
    'var:NEXT_PUBLIC_SITE_URL': 'https://turbopanel.io',
    'var:DOCS_SEARCH_KEY': '••••••••',
    'var:NODE_ENV': 'production',
  },
  users: [
    { ...linuxUserFromDeclared('website', 'sftp'), sshKeyCount: 1, createdOnFirstDeploy: false },
    linuxUserFromDeclared('testing-web'),
  ],
  links: [],
  environments: [
    {
      id: 'production',
      name: 'Production',
      source: { standsAlone: false, changes: [] },
      domains: [
        { host: 'turbopanel.io', status: secure },
        { host: 'www.turbopanel.io', status: secure, redirectTo: 'turbopanel.io' },
      ],
      volumes: [
        { name: 'next-cache', mount: 'web:/app/.next/cache', size: '310 MB', lastBackup: null },
      ],
    },
    {
      id: 'staging',
      name: 'Staging',
      source: {
        standsAlone: false,
        changes: [{ key: 'var:NEXT_PUBLIC_SITE_URL', value: 'https://staging.turbopanel.io' }],
      },
      domains: [{ host: 'staging.turbopanel.io', status: secure }],
      volumes: [],
    },
    {
      id: 'testing',
      name: 'Testing',
      source: {
        standsAlone: false,
        changes: [
          { key: 'svc:web:start', value: 'next start' },
          { key: 'svc:web:runsAs', value: 'testing-web' },
        ],
      },
      domains: [
        { host: 'testing.turbopanel.io', status: { key: 'issuing', label: 'Getting certificate' } },
      ],
      volumes: [],
    },
  ],
}

const blog: SampleProject = {
  id: 'blog',
  name: 'acme-blog',
  services: [
    { id: 'site', name: 'wordpress', kind: 'site', web: true, jobCount: 1 },
    { id: 'db', name: 'mysql', kind: 'database', engine: 'MySQL 8.4' },
  ],
  base: { ...siteRows('site', 'acme-blog'), 'var:WP_HOME': 'https://blog.acme.com' },
  users: [
    {
      ...linuxUserFromDeclared('acme-blog', 'ssh'),
      sshKeyCount: 2,
      passwordAuth: true,
      createdOnFirstDeploy: false,
    },
  ],
  links: [{ from: 'site', to: 'db', kind: 'data' }],
  environments: [
    {
      id: 'production',
      name: 'Production',
      source: { standsAlone: false, changes: [] },
      domains: [
        { host: 'blog.acme.com', status: secure },
        { host: 'www.blog.acme.com', status: secure, redirectTo: 'blog.acme.com' },
      ],
      volumes: [
        {
          name: 'uploads',
          mount: 'wordpress:/var/www/wp-content/uploads',
          size: '2.1 GB',
          lastBackup: 'Today 04:00',
        },
      ],
    },
  ],
}

const portalBase: FlatConfig = {
  ...siteRows('app', 'portal'),
  'var:APP_ENV': 'production',
  'var:APP_DEBUG': 'false',
  'var:APP_KEY': '••••••••',
  'var:DATABASE_URL': '••••••••',
  'var:MAIL_PASSWORD': '••••••••',
}

const portal: SampleProject = {
  id: 'portal',
  name: 'client-portal',
  services: [
    { id: 'app', name: 'app', kind: 'site', web: true, jobCount: 1 },
    { id: 'db', name: 'postgres', kind: 'database', engine: 'PostgreSQL 17' },
  ],
  base: portalBase,
  users: [
    { ...linuxUserFromDeclared('portal', 'sftp'), sshKeyCount: 1, createdOnFirstDeploy: false },
    linuxUserFromDeclared('portal-staging'),
  ],
  links: [{ from: 'app', to: 'db', kind: 'data' }],
  environments: [
    {
      id: 'production',
      name: 'Production',
      source: { standsAlone: false, changes: [] },
      domains: [
        { host: 'portal.acme.com', status: { key: 'expiring', label: 'Expires soon' } },
        { host: 'shop.acme.com', status: { key: 'renewal_failed', label: 'Renewal failed' } },
      ],
      volumes: [
        {
          name: 'invoices',
          mount: 'app:/srv/portal/storage/app/invoices',
          size: '640 MB',
          lastBackup: 'Today 02:00',
        },
      ],
    },
    {
      id: 'staging',
      name: 'Staging',
      source: {
        standsAlone: false,
        changes: [
          { key: 'svc:app:runsAs', value: 'portal-staging' },
          { key: 'var:APP_ENV', value: 'staging' },
          { key: 'svc:app:start', value: 'php artisan octane:start' },
        ],
      },
      domains: [
        { host: 'portal-staging.acme.com', status: { key: 'test', label: 'Test certificate' } },
      ],
      volumes: [],
    },
    {
      id: 'preview',
      name: 'Preview',
      source: {
        standsAlone: true,
        values: {
          ...Object.fromEntries(Object.entries(portalBase).filter(([key]) => !key.startsWith('var:'))),
          'var:APP_ENV': 'preview',
          'var:APP_DEBUG': 'true',
        },
      },
      domains: [
        { host: 'preview.portal.acme.com', status: { key: 'waiting', label: 'Waiting for DNS' } },
      ],
      volumes: [],
    },
  ],
}

const api: SampleProject = {
  id: 'api',
  name: 'example-api',
  services: [
    { id: 'api', name: 'api', kind: 'container', image: 'build: ./api', web: true },
    { id: 'worker', name: 'worker', kind: 'container', image: 'build: ./worker' },
    { id: 'redis', name: 'redis', kind: 'container', image: 'redis:8' },
    { id: 'db', name: 'postgres', kind: 'database', engine: 'PostgreSQL 17' },
  ],
  base: {
    'svc:api:image': 'build: ./api',
    'svc:api:port': '8080',
    'svc:api:instances': '2',
    'var:PORT': '8080',
    'var:REDIS_URL': 'redis://redis:6379',
    'var:JWT_SECRET': '••••••••',
  },
  users: [],
  links: [
    { from: 'api', to: 'db', kind: 'data' },
    { from: 'worker', to: 'db', kind: 'data' },
    { from: 'api', to: 'redis', kind: 'internal' },
    { from: 'worker', to: 'redis', kind: 'internal' },
  ],
  environments: [
    {
      id: 'production',
      name: 'Production',
      source: { standsAlone: false, changes: [] },
      domains: [{ host: 'api.acme.com', status: secure }],
      volumes: [{ name: 'redis-data', mount: 'redis:/data', size: '64 MB', lastBackup: 'Today 01:30' }],
    },
  ],
}

export const SAMPLE_PROJECTS: readonly SampleProject[] = [website, blog, portal, api]

export function sampleProject(id: string): SampleProject {
  const found = SAMPLE_PROJECTS.find((project) => project.id === id)
  if (found === undefined) throw new Error(`no sample project ${id}`)
  return found
}

export function sampleEnvironment(project: SampleProject, id: string): SampleEnvironment {
  const found = project.environments.find((env) => env.id === id)
  if (found === undefined) throw new Error(`no sample environment ${id}`)
  return found
}

/** Every project x environment pair, for `it.each`. */
export const SAMPLE_ENVIRONMENTS: readonly (readonly [string, SampleProject, SampleEnvironment])[] =
  SAMPLE_PROJECTS.flatMap((project) =>
    project.environments.map((env) => [`${project.id}/${env.id}`, project, env] as const),
  )

export function sampleView(env: SampleEnvironment): EnvironmentView {
  return { name: env.name, source: env.source }
}

export function sampleDefaultUser(project: SampleProject): string {
  return defaultLinuxUser(project.users, project.name)
}

/** What the screens would pass to `mapLayout` for a sample environment (null = the Base). */
export function sampleMapInput(
  project: SampleProject,
  env: SampleEnvironment | null,
  mode: MapMode,
): MapInput {
  const defaultUser = sampleDefaultUser(project)
  return {
    mode,
    envName: env?.name ?? null,
    services: project.services,
    domains: env?.domains ?? [],
    volumes: env?.volumes ?? [],
    links: project.links,
    changes:
      env === null
        ? []
        : environmentChanges({
            envName: env.name,
            services: project.services,
            base: project.base,
            source: env.source,
          }),
    runsAs: (service, inEnvironment) =>
      resolveRunsAs({
        service,
        base: project.base,
        env: inEnvironment && env !== null ? sampleView(env) : undefined,
        users: project.users,
        defaultUser,
      }),
    status: () => ({ key: 'running', label: 'Running' }),
  }
}

/** Flat values an environment runs with, for assertions. */
export function sampleValues(project: SampleProject, env: SampleEnvironment): FlatConfig {
  return environmentValues(project.base, env.source)
}
