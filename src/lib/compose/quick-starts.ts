import { yamlToComposeDocument, type ComposeDocument } from '@/lib/compose'

export type ComposeQuickStartId = 'blank' | 'nginx' | 'postgres' | 'node'

export type ComposeQuickStart = {
  id: ComposeQuickStartId
  label: string
  description: string
  marker: string
}

export const COMPOSE_QUICK_STARTS: readonly ComposeQuickStart[] = [
  {
    id: 'blank',
    label: 'Blank',
    marker: '∅',
    description: 'Empty base — add services yourself',
  },
  {
    id: 'nginx',
    label: 'Nginx',
    marker: 'NG',
    description: 'Simple web server on port 80',
  },
  {
    id: 'postgres',
    label: 'Postgres',
    marker: 'PG',
    description: 'Database with a default volume',
  },
  {
    id: 'node',
    label: 'Node app',
    marker: 'JS',
    description: 'Build from a Dockerfile in ./app',
  },
]

const QUICK_START_YAML: Record<Exclude<ComposeQuickStartId, 'blank'>, string> = {
  nginx: `services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    restart: unless-stopped
`,
  postgres: `services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_PASSWORD: changeme
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
`,
  node: `services:
  app:
    build: ./app
    ports:
      - "3000:3000"
    restart: unless-stopped
`,
}

export function composeQuickStartDocument(
  id: ComposeQuickStartId,
): ComposeDocument {
  if (id === 'blank') {
    return yamlToComposeDocument('')
  }
  return yamlToComposeDocument(QUICK_START_YAML[id])
}
